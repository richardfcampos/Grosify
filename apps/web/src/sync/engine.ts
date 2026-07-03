import {
  db,
  type LocalInventory,
  type LocalItem,
  type LocalListEntry,
  type LocalSession,
  type OutboxEntry,
} from '../db/dexie.js';
import { storageDisabled, uploadBlob } from '../lib/uploads.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3010';
const CURSOR_KEY = 'syncCursor';

const HOUSEHOLD_KEY = 'householdId';

let currentHouseholdId = '';
let syncing = false;
let started = false;

export function householdId(): string {
  return currentHouseholdId;
}

// ---- Estado de sync observável (pra UI: offline/sincronizando/sincronizado/erro) ----
export type SyncState = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
let syncState: SyncState = 'idle';
const syncListeners = new Set<() => void>();

function setSyncState(s: SyncState): void {
  if (s === syncState) return;
  syncState = s;
  syncListeners.forEach((l) => l());
}
export function getSyncState(): SyncState {
  return syncState;
}
export function subscribeSync(fn: () => void): () => void {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

/** Limpa todo o cache de domínio + outbox + cursor (troca de conta / logout). */
export async function clearLocalData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.items,
      db.categories,
      db.barcodes,
      db.brands,
      db.comments,
      db.stores,
      db.prices,
      db.lists,
      db.listEntries,
      db.inventory,
      db.movements,
      db.sessions,
      db.sessionItems,
      db.outbox,
      db.deadLetter,
      db.meta,
    ],
    async () => {
      await Promise.all([
        db.items.clear(),
        db.categories.clear(),
        db.barcodes.clear(),
        db.brands.clear(),
        db.comments.clear(),
        db.stores.clear(),
        db.prices.clear(),
        db.lists.clear(),
        db.listEntries.clear(),
        db.inventory.clear(),
        db.movements.clear(),
        db.sessions.clear(),
        db.sessionItems.clear(),
        db.outbox.clear(),
        db.deadLetter.clear(),
        db.meta.clear(),
      ]);
    },
  );
}

/**
 * Define a casa ativa. Se mudou de casa (login como outro usuário), zera o cache
 * local antes — evita vazar dados de outra conta no mesmo navegador.
 */
export async function initHousehold(id: string): Promise<void> {
  const prev = await db.meta.get(HOUSEHOLD_KEY);
  if (prev?.value && prev.value !== id) await clearLocalData();
  await db.meta.put({ key: HOUSEHOLD_KEY, value: id });
  currentHouseholdId = id;
}

/** Enfileira uma mutação e tenta sincronizar (se online). */
export async function enqueue(entry: OutboxEntry): Promise<void> {
  await db.outbox.add(entry);
  if (navigator.onLine) void syncNow();
}

async function getCursor(): Promise<number> {
  const row = await db.meta.get(CURSOR_KEY);
  return row ? Number(row.value) : 0;
}
async function setCursor(value: number): Promise<void> {
  await db.meta.put({ key: CURSOR_KEY, value: String(value) });
}

/** Tentativas de replay (5xx) antes de mandar a entry pro dead-letter. */
const MAX_OUTBOX_ATTEMPTS = 5;

/**
 * Replica a outbox em ordem. Offline (fetch lança) → para e mantém tudo pra depois.
 * 5xx numa entry: conta a tentativa e SEGUE pras próximas — uma entry presa não pode
 * travar as independentes (head-of-line). Após MAX tentativas, move pro dead-letter e
 * tira da fila ativa, pra uma mutação determinísticamente quebrada (ex.: referência
 * órfã num servidor sem o fix) não bloquear o sync pra sempre. Nada é descartado: o
 * dead-letter é recuperável via retryDeadLetters.
 * Retorna false se algo ficou pendente/falhou (mantém o estado 'error' na UI).
 */
async function drainOutbox(): Promise<boolean> {
  const entries = await db.outbox.orderBy('seq').toArray();
  let allClean = true;
  for (const entry of entries) {
    let res: Response;
    try {
      res = await fetch(API_URL + entry.path, {
        method: entry.method,
        headers: entry.body ? { 'Content-Type': 'application/json' } : {},
        body: entry.body ? JSON.stringify(entry.body) : undefined,
        credentials: 'include',
      });
    } catch {
      return false; // offline: para e tenta tudo de novo depois
    }
    if (res.status >= 500) {
      const attempts = (entry.attempts ?? 0) + 1;
      if (attempts >= MAX_OUTBOX_ATTEMPTS) {
        // poison: sai da fila ativa pra não travar o resto; guardada pra retry manual
        await db.transaction('rw', [db.outbox, db.deadLetter], async () => {
          await db.deadLetter.add({
            method: entry.method,
            path: entry.path,
            body: entry.body,
            rowId: entry.rowId,
            status: res.status,
            attempts,
            failedAt: new Date().toISOString(),
          });
          await db.outbox.delete(entry.seq!);
        });
      } else {
        await db.outbox.update(entry.seq!, { attempts });
      }
      allClean = false;
      continue; // segue pras próximas: as independentes drenam mesmo com esta falhando
    }
    // 2xx (sucesso) ou 4xx (rejeição definitiva: limite/validação) → remove da fila
    await db.outbox.delete(entry.seq!);
  }
  return allClean;
}

function num<T extends { qty?: unknown; qtyOnHand?: unknown }>(row: T): T {
  if ('qty' in row) (row as { qty: unknown }).qty = Number((row as { qty: unknown }).qty);
  if ('qtyOnHand' in row)
    (row as { qtyOnHand: unknown }).qtyOnHand = Number((row as { qtyOnHand: unknown }).qtyOnHand);
  return row;
}

/** Converte numeric (string) → number em qty/balanceAfter do movimento de estoque. */
function numMovement(row: unknown): unknown {
  const r = row as { qty: unknown; balanceAfter: unknown };
  r.qty = Number(r.qty);
  r.balanceAfter = Number(r.balanceAfter);
  return r;
}

/** Converte numeric (string) → number nos campos de quantidade do item de sessão. */
function numSessionItem(row: unknown): unknown {
  const r = row as { neededQty: unknown; actualQty: unknown };
  r.neededQty = Number(r.neededQty);
  r.actualQty = r.actualQty === null || r.actualQty === undefined ? null : Number(r.actualQty);
  return r;
}

/**
 * Sobe pro R2 fotos que estão só locais (blob presente, key ainda null) e
 * enfileira o PATCH com a key — assim os outros membros recebem via sync e
 * baixam sob demanda. Cobre fotos tiradas offline (ex.: recibo no mercado).
 * No-op se R2 está desligado no servidor (501) ou offline.
 */
async function drainPhotoUploads(): Promise<void> {
  if (storageDisabled()) return;

  const items = await db.items
    .filter((i) => i.deletedAt === null && i.photoKey == null && i.photoBlob != null)
    .toArray();
  for (const it of items) {
    const key = await uploadBlob('item', it.id, it.photoBlob as Blob);
    if (key === null) return; // R2 off ou falha de rede → tenta no próximo ciclo
    const ts = new Date().toISOString();
    await db.items.update(it.id, { photoKey: key, updatedAt: ts });
    await db.outbox.add({ method: 'PATCH', path: `/catalog/items/${it.id}`, body: { photoKey: key }, rowId: it.id });
  }

  const sessions = await db.sessions
    .filter((s) => s.deletedAt === null && s.receiptKey == null && s.receiptBlob != null)
    .toArray();
  for (const s of sessions) {
    const key = await uploadBlob('receipt', s.id, s.receiptBlob as Blob);
    if (key === null) return;
    const ts = new Date().toISOString();
    await db.sessions.update(s.id, { receiptKey: key, updatedAt: ts });
    await db.outbox.add({ method: 'PATCH', path: `/shopping/sessions/${s.id}`, body: { receiptKey: key }, rowId: s.id });
  }
}

/** Puxa mudanças do servidor e aplica no Dexie, sem clobrar pendências locais nem fotos. */
async function pull(): Promise<boolean> {
  const cursor = await getCursor();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/sync/pull?cursor=${cursor}`, { credentials: 'include' });
  } catch {
    return false;
  }
  if (!res.ok) return false;
  const { changes, cursor: newCursor } = (await res.json()) as {
    changes: Record<string, Record<string, unknown>[]>;
    cursor: number;
  };

  // ids com mutação pendente: não sobrescrever a versão local otimista
  const pendingIds = new Set((await db.outbox.toArray()).map((e) => e.rowId));

  await db.transaction(
    'rw',
    [
      db.items,
      db.categories,
      db.barcodes,
      db.brands,
      db.comments,
      db.stores,
      db.prices,
      db.lists,
      db.listEntries,
      db.inventory,
      db.movements,
      db.sessions,
      db.sessionItems,
    ],
    async () => {
      for (const row of changes.items ?? []) {
        const r = row as unknown as LocalItem;
        if (pendingIds.has(r.id)) continue;
        const existing = await db.items.get(r.id);
        await db.items.put({ ...r, photoBlob: existing?.photoBlob ?? null });
      }
      await applyTable(db.categories, changes.categories, pendingIds);
      await applyTable(db.barcodes, changes.item_barcodes, pendingIds);
      await applyTable(db.brands, changes.item_brands, pendingIds);
      await applyTable(db.comments, changes.item_comments, pendingIds);
      await applyTable(db.stores, changes.stores, pendingIds);
      await applyTable(db.prices, changes.price_records, pendingIds);
      await applyTable(db.lists, changes.shopping_lists, pendingIds);
      await applyTable(
        db.listEntries,
        (changes.shopping_list_entries ?? []).map((e) => num(e as LocalListEntry)),
        pendingIds,
      );
      await applyTable(
        db.inventory,
        (changes.inventory_counts ?? []).map((i) => num(i as LocalInventory)),
        pendingIds,
      );
      await applyTable(db.movements, (changes.stock_movements ?? []).map(numMovement), pendingIds);
      for (const row of changes.shopping_sessions ?? []) {
        const r = row as unknown as LocalSession;
        if (pendingIds.has(r.id)) continue;
        const existing = await db.sessions.get(r.id);
        await db.sessions.put({ ...r, receiptBlob: existing?.receiptBlob ?? null });
      }
      await applyTable(
        db.sessionItems,
        (changes.shopping_session_items ?? []).map((i) => numSessionItem(i)),
        pendingIds,
      );
    },
  );

  if (newCursor > cursor) await setCursor(newCursor);
  return true;
}

async function applyTable(
  table: { put: (row: never) => Promise<unknown> },
  rows: unknown[] | undefined,
  pendingIds: Set<string>,
): Promise<void> {
  for (const row of rows ?? []) {
    if (pendingIds.has((row as { id: string }).id)) continue;
    await table.put(row as never);
  }
}

/** Drena outbox e puxa mudanças. Não concorrente. Atualiza o estado observável. */
export async function syncNow(): Promise<void> {
  if (syncing) return;
  if (!navigator.onLine) {
    setSyncState('offline');
    return;
  }
  syncing = true;
  setSyncState('syncing');
  try {
    const okDrain = await drainOutbox();
    // sobe fotos locais sem key e enfileira o PATCH; segundo drain manda essas keys
    if (okDrain) await drainPhotoUploads();
    const okDrain2 = (await db.outbox.count()) ? await drainOutbox() : okDrain;
    const okPull = await pull();
    setSyncState(okDrain && okDrain2 && okPull ? 'synced' : 'error');
  } finally {
    syncing = false;
  }
}

/** Liga gatilhos: online, foco/visível, 30s. Idempotente. */
export function startSync(): void {
  if (started) return;
  started = true;
  const tick = () => void syncNow();
  window.addEventListener('online', tick);
  window.addEventListener('offline', () => setSyncState('offline'));
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  setInterval(tick, 30_000);
  // SSE: servidor "poka" quando outro membro muda algo → sincroniza na hora
  try {
    const es = new EventSource(`${API_URL}/sync/stream`, { withCredentials: true });
    es.addEventListener('poke', () => void syncNow());
  } catch {
    // SSE indisponível — segue com os gatilhos por tempo/foco
  }
  tick();
}

/** Conta de mutações pendentes (pra UI de status). */
export function pendingCount() {
  return db.outbox.count();
}

/** Conta de mutações no dead-letter (poison que saiu da fila ativa). */
export function deadLetterCount() {
  return db.deadLetter.count();
}

/**
 * Recoloca os dead-letters na outbox (zerando as tentativas) e sincroniza. Uso: depois
 * de corrigir a causa no servidor (ex.: deploy do fix), reprocessar o que foi barrado.
 */
export async function retryDeadLetters(): Promise<void> {
  const dead = await db.deadLetter.orderBy('seq').toArray();
  if (dead.length === 0) return;
  await db.transaction('rw', [db.deadLetter, db.outbox], async () => {
    for (const d of dead) {
      await db.outbox.add({ method: d.method, path: d.path, body: d.body, rowId: d.rowId });
    }
    await db.deadLetter.clear();
  });
  if (navigator.onLine) void syncNow();
}
