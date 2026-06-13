import {
  db,
  type LocalInventory,
  type LocalItem,
  type LocalListEntry,
  type OutboxEntry,
} from '../db/dexie.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3010';
const CURSOR_KEY = 'syncCursor';

let currentHouseholdId = '';
let syncing = false;
let started = false;

export function setHouseholdId(id: string): void {
  currentHouseholdId = id;
}
export function householdId(): string {
  return currentHouseholdId;
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

/** Replica a outbox em ordem; para na primeira falha de rede (mantém fila). */
async function drainOutbox(): Promise<void> {
  const entries = await db.outbox.orderBy('seq').toArray();
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
      return; // offline: tenta de novo depois
    }
    if (res.status >= 500) return; // erro de servidor: mantém pra retry
    // 2xx (sucesso) ou 4xx (rejeição definitiva: limite/validação) → remove da fila
    await db.outbox.delete(entry.seq!);
  }
}

function num<T extends { qty?: unknown; qtyOnHand?: unknown }>(row: T): T {
  if ('qty' in row) (row as { qty: unknown }).qty = Number((row as { qty: unknown }).qty);
  if ('qtyOnHand' in row)
    (row as { qtyOnHand: unknown }).qtyOnHand = Number((row as { qtyOnHand: unknown }).qtyOnHand);
  return row;
}

/** Puxa mudanças do servidor e aplica no Dexie, sem clobrar pendências locais nem fotos. */
async function pull(): Promise<void> {
  const cursor = await getCursor();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/sync/pull?cursor=${cursor}`, { credentials: 'include' });
  } catch {
    return;
  }
  if (!res.ok) return;
  const { changes, cursor: newCursor } = (await res.json()) as {
    changes: Record<string, Record<string, unknown>[]>;
    cursor: number;
  };

  // ids com mutação pendente: não sobrescrever a versão local otimista
  const pendingIds = new Set((await db.outbox.toArray()).map((e) => e.rowId));

  await db.transaction(
    'rw',
    [db.items, db.barcodes, db.stores, db.prices, db.lists, db.listEntries, db.inventory],
    async () => {
      for (const row of changes.items ?? []) {
        const r = row as unknown as LocalItem;
        if (pendingIds.has(r.id)) continue;
        const existing = await db.items.get(r.id);
        await db.items.put({ ...r, photoBlob: existing?.photoBlob ?? null });
      }
      await applyTable(db.barcodes, changes.item_barcodes, pendingIds);
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
    },
  );

  if (newCursor > cursor) await setCursor(newCursor);
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

/** Drena outbox e puxa mudanças. Não concorrente. */
export async function syncNow(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    await drainOutbox();
    await pull();
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
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  setInterval(tick, 30_000);
  tick();
}

/** Conta de mutações pendentes (pra UI de status). */
export function pendingCount() {
  return db.outbox.count();
}
