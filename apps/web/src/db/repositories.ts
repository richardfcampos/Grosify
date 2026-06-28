import { cheapestStore, neededQty, type Recurrence, type Unit } from '@grosify/shared';
import { v7 as uuidv7 } from 'uuid';
import { enqueue, householdId, syncNow } from '../sync/engine.js';
import {
  db,
  type LocalBrand,
  type LocalCategory,
  type LocalComment,
  type LocalInventory,
  type LocalMovement,
  type LocalItem,
  type LocalList,
  type LocalListEntry,
  type LocalPrice,
  type LocalSession,
  type LocalSessionItem,
  type LocalStore,
} from './dexie.js';

/**
 * Repositório local-first: escreve no Dexie na hora (otimista) e enfileira a
 * mutação na outbox. O engine replica no servidor quando online. UI lê do Dexie.
 */

const nowISO = () => new Date().toISOString();
const hid = () => householdId();

/** Bootstrap: primeiro sync (drena outbox + pull). Chamado ao montar o app autenticado. */
export async function syncBootstrap(): Promise<void> {
  await syncNow();
}

// ---------- Itens ----------

export interface NewItemInput {
  name: string;
  category?: string | null;
  categoryId?: string | null;
  notes?: string | null;
  minStock?: number | null;
  unit: Unit;
  photoBlob?: Blob | null;
  barcodes: string[];
}

export async function createItem(input: NewItemInput): Promise<string> {
  const id = uuidv7();
  const ts = nowISO();
  const barcodeRows = input.barcodes.map((barcode) => ({ id: uuidv7(), barcode }));

  await db.items.put({
    id,
    householdId: hid(),
    name: input.name,
    category: input.category ?? null,
    categoryId: input.categoryId ?? null,
    notes: input.notes ?? null,
    minStock: input.minStock ?? null,
    photoKey: null,
    unit: input.unit,
    updatedAt: ts,
    deletedAt: null,
    serverVersion: 0,
    photoBlob: input.photoBlob ?? null,
  });
  await db.barcodes.bulkPut(
    barcodeRows.map((b) => ({
      id: b.id,
      householdId: hid(),
      itemId: id,
      brandId: null,
      barcode: b.barcode,
      updatedAt: ts,
      deletedAt: null,
      serverVersion: 0,
    })),
  );
  await enqueue({
    method: 'POST',
    path: '/catalog/items',
    body: {
      id,
      name: input.name,
      category: input.category ?? undefined,
      categoryId: input.categoryId ?? undefined,
      notes: input.notes ?? undefined,
      minStock: input.minStock ?? undefined,
      unit: input.unit,
      barcodes: barcodeRows,
    },
    rowId: id,
  });
  return id;
}

export async function updateItem(
  id: string,
  updates: {
    name?: string;
    category?: string | null;
    categoryId?: string | null;
    notes?: string | null;
    minStock?: number | null;
    unit?: Unit;
    photoBlob?: Blob | null;
  },
): Promise<void> {
  const { photoBlob, ...serverFields } = updates;
  await db.items.update(id, {
    ...serverFields,
    ...(photoBlob !== undefined ? { photoBlob } : {}),
    updatedAt: nowISO(),
  });
  await enqueue({ method: 'PATCH', path: `/catalog/items/${id}`, body: serverFields, rowId: id });
}

export async function deleteItem(id: string): Promise<void> {
  const ts = nowISO();
  await db.items.update(id, { deletedAt: ts, updatedAt: ts });
  await db.barcodes.where('itemId').equals(id).modify({ deletedAt: ts, updatedAt: ts });
  await enqueue({ method: 'DELETE', path: `/catalog/items/${id}`, rowId: id });
}

export async function addBarcode(
  itemId: string,
  barcode: string,
  brandId: string | null = null,
): Promise<void> {
  const id = uuidv7();
  await db.barcodes.put({
    id,
    householdId: hid(),
    itemId,
    brandId,
    barcode,
    updatedAt: nowISO(),
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({
    method: 'POST',
    path: `/catalog/items/${itemId}/barcodes`,
    body: { id, barcode, brandId },
    rowId: id,
  });
}

export async function removeBarcode(id: string): Promise<void> {
  await db.barcodes.update(id, { deletedAt: nowISO() });
  await enqueue({ method: 'DELETE', path: `/catalog/barcodes/${id}`, rowId: id });
}

// ---------- Categorias ----------

export async function createCategory(
  name: string,
  icon: string | null = null,
  color: string | null = null,
): Promise<string> {
  const id = uuidv7();
  const ts = nowISO();
  const existing = await db.categories.where('householdId').equals(hid()).toArray();
  const sortOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder + 1), 0);
  await db.categories.put({
    id,
    householdId: hid(),
    name,
    icon,
    color,
    sortOrder,
    isHidden: false,
    updatedAt: ts,
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({
    method: 'POST',
    path: '/catalog/categories',
    body: { id, name, icon, color, sortOrder },
    rowId: id,
  });
  return id;
}

export async function updateCategory(
  id: string,
  updates: { name?: string; icon?: string | null; color?: string | null; isHidden?: boolean },
): Promise<void> {
  const ts = nowISO();
  await db.categories.update(id, { ...updates, updatedAt: ts });
  // propaga novo nome para o cache desnormalizado dos itens
  if (updates.name !== undefined) {
    await db.items.where('categoryId').equals(id).modify({ category: updates.name, updatedAt: ts });
  }
  await enqueue({ method: 'PATCH', path: `/catalog/categories/${id}`, body: updates, rowId: id });
}

export async function deleteCategory(id: string): Promise<void> {
  const ts = nowISO();
  await db.categories.update(id, { deletedAt: ts, updatedAt: ts });
  await db.items.where('categoryId').equals(id).modify({ categoryId: null, category: null, updatedAt: ts });
  await enqueue({ method: 'DELETE', path: `/catalog/categories/${id}`, rowId: id });
}

export async function reorderCategories(ids: string[]): Promise<void> {
  const ts = nowISO();
  await db.transaction('rw', db.categories, async () => {
    for (let i = 0; i < ids.length; i++) {
      await db.categories.update(ids[i]!, { sortOrder: i, updatedAt: ts });
    }
  });
  await enqueue({ method: 'POST', path: '/catalog/categories/reorder', body: { ids }, rowId: ids[0] ?? '' });
}

// ---------- Marcas ----------

export async function createBrand(
  itemId: string,
  name: string,
  isPreferred = false,
): Promise<string> {
  const id = uuidv7();
  const ts = nowISO();
  // preferida é única por item — desmarca as demais localmente
  if (isPreferred) {
    await db.brands.where('itemId').equals(itemId).modify({ isPreferred: false, updatedAt: ts });
  }
  await db.brands.put({
    id,
    householdId: hid(),
    itemId,
    name,
    isPreferred,
    updatedAt: ts,
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({
    method: 'POST',
    path: '/catalog/brands',
    body: { id, itemId, name, isPreferred },
    rowId: id,
  });
  return id;
}

/** Define/limpa a marca preferida de um item (única por item). */
export async function setBrandPreferred(
  itemId: string,
  brandId: string,
  value: boolean,
): Promise<void> {
  const ts = nowISO();
  if (value) {
    await db.brands.where('itemId').equals(itemId).modify({ isPreferred: false, updatedAt: ts });
  }
  await db.brands.update(brandId, { isPreferred: value, updatedAt: ts });
  await enqueue({
    method: 'PATCH',
    path: `/catalog/brands/${brandId}`,
    body: { isPreferred: value },
    rowId: brandId,
  });
}

export async function deleteBrand(id: string): Promise<void> {
  await db.brands.update(id, { deletedAt: nowISO() });
  await enqueue({ method: 'DELETE', path: `/catalog/brands/${id}`, rowId: id });
}

/** Resolve um código de barras → item + marca (dedup no scanner). Local-only. */
export async function resolveBarcode(
  barcode: string,
): Promise<{ itemId: string; brandId: string | null } | null> {
  const local = await db.barcodes
    .where('barcode')
    .equals(barcode)
    .and((b) => b.deletedAt === null)
    .first();
  return local ? { itemId: local.itemId, brandId: local.brandId ?? null } : null;
}

// ---------- Comentários ----------

export async function createComment(
  itemId: string,
  text: string,
  authorId: string | null,
  authorName: string | null,
): Promise<string> {
  const id = uuidv7();
  const ts = nowISO();
  await db.comments.put({
    id,
    householdId: hid(),
    itemId,
    authorId,
    authorName,
    body: text,
    updatedAt: ts,
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({
    method: 'POST',
    path: `/catalog/items/${itemId}/comments`,
    body: { id, itemId, authorId, authorName, body: text },
    rowId: id,
  });
  return id;
}

export async function deleteComment(id: string): Promise<void> {
  await db.comments.update(id, { deletedAt: nowISO() });
  await enqueue({ method: 'DELETE', path: `/catalog/comments/${id}`, rowId: id });
}

// ---------- Lojas ----------

export interface NewStoreInput {
  name: string;
  city?: string | null;
  neighborhood?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export async function createStore(input: NewStoreInput): Promise<string> {
  const id = uuidv7();
  await db.stores.put({
    id,
    householdId: hid(),
    name: input.name,
    city: input.city ?? null,
    neighborhood: input.neighborhood ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    updatedAt: nowISO(),
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({
    method: 'POST',
    path: '/catalog/stores',
    body: {
      id,
      name: input.name,
      city: input.city ?? undefined,
      neighborhood: input.neighborhood ?? undefined,
      lat: input.lat ?? undefined,
      lng: input.lng ?? undefined,
    },
    rowId: id,
  });
  return id;
}

export async function updateStore(
  id: string,
  updates: { name?: string; city?: string | null; neighborhood?: string | null; lat?: number | null; lng?: number | null },
): Promise<void> {
  await db.stores.update(id, { ...updates, updatedAt: nowISO() });
  await enqueue({ method: 'PATCH', path: `/catalog/stores/${id}`, body: updates, rowId: id });
}

export async function deleteStore(id: string): Promise<void> {
  await db.stores.update(id, { deletedAt: nowISO() });
  await enqueue({ method: 'DELETE', path: `/catalog/stores/${id}`, rowId: id });
}

// ---------- Listas ----------

export interface NewListInput {
  name: string;
  isRecurring: boolean;
  isPrivate?: boolean;
  budgetCents?: number | null;
  icon?: string | null;
  color?: string | null;
  recurrence?: Recurrence | null;
  recurrenceDay?: number | null;
}

export async function createList(input: NewListInput): Promise<string> {
  const id = uuidv7();
  const isPrivate = input.isPrivate ?? false;
  const body = {
    id,
    name: input.name,
    isRecurring: input.isRecurring,
    isPrivate,
    budgetCents: input.budgetCents ?? null,
    icon: input.icon ?? null,
    color: input.color ?? null,
    recurrence: input.recurrence ?? null,
    recurrenceDay: input.recurrenceDay ?? null,
  };
  await db.lists.put({
    ...body,
    // ownerId real vem do servidor no próximo pull; localmente basta o flag pro silo
    ownerId: null,
    householdId: hid(),
    updatedAt: nowISO(),
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({ method: 'POST', path: '/shopping/lists', body, rowId: id });
  return id;
}

export async function updateList(
  id: string,
  updates: {
    name?: string;
    isRecurring?: boolean;
    budgetCents?: number | null;
    icon?: string | null;
    color?: string | null;
    recurrence?: Recurrence | null;
    recurrenceDay?: number | null;
  },
): Promise<void> {
  await db.lists.update(id, { ...updates, updatedAt: nowISO() });
  await enqueue({ method: 'PATCH', path: `/shopping/lists/${id}`, body: updates, rowId: id });
}

export async function deleteList(id: string): Promise<void> {
  const ts = nowISO();
  await db.lists.update(id, { deletedAt: ts, updatedAt: ts });
  await db.listEntries.where('listId').equals(id).modify({ deletedAt: ts, updatedAt: ts });
  await enqueue({ method: 'DELETE', path: `/shopping/lists/${id}`, rowId: id });
}

export async function setListEntry(listId: string, itemId: string, qty: number): Promise<void> {
  const existing = await db.listEntries
    .where('listId')
    .equals(listId)
    .and((e) => e.itemId === itemId)
    .first();
  const id = existing?.id ?? uuidv7();
  await db.listEntries.put({
    id,
    householdId: hid(),
    listId,
    itemId,
    qty,
    assignedTo: existing?.assignedTo ?? null,
    assignedToName: existing?.assignedToName ?? null,
    updatedAt: nowISO(),
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({
    method: 'PUT',
    path: `/shopping/lists/${listId}/entries`,
    body: { id, itemId, qty },
    rowId: id,
  });
}

/** Define o membro responsável por uma entrada da lista. */
export async function assignListEntry(
  listId: string,
  itemId: string,
  assignedTo: string | null,
  assignedToName: string | null,
): Promise<void> {
  const existing = await db.listEntries
    .where('listId')
    .equals(listId)
    .and((e) => e.itemId === itemId && e.deletedAt === null)
    .first();
  if (!existing) return;
  await db.listEntries.update(existing.id, { assignedTo, assignedToName, updatedAt: nowISO() });
  await enqueue({
    method: 'PUT',
    path: `/shopping/lists/${listId}/entries`,
    body: { id: existing.id, itemId, qty: Number(existing.qty), assignedTo, assignedToName },
    rowId: existing.id,
  });
}

export async function removeListEntry(id: string): Promise<void> {
  await db.listEntries.update(id, { deletedAt: nowISO() });
  await enqueue({ method: 'DELETE', path: `/shopping/lists/entries/${id}`, rowId: id });
}

// ---------- Preços ----------

export async function recordPrice(
  itemId: string,
  storeId: string,
  priceCents: number,
  brandId: string | null = null,
  rating: number | null = null,
): Promise<void> {
  const id = uuidv7();
  const ts = nowISO();
  await db.prices.put({
    id,
    householdId: hid(),
    itemId,
    brandId,
    storeId,
    priceCents,
    recordedAt: ts,
    source: 'manual',
    rating,
    updatedAt: ts,
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({
    method: 'POST',
    path: '/shopping/prices',
    body: { id, itemId, brandId, storeId, priceCents, rating },
    rowId: id,
  });
}

// ---------- Inventário + ledger de movimentos ----------

const round3 = (n: number) => Math.round(n * 1000) / 1000;

type MovementType = 'purchase' | 'consumption' | 'adjustment' | 'count';

/** Núcleo: ajusta o saldo do item e registra um movimento no ledger. */
async function recordInventory(
  itemId: string,
  newQty: number,
  type: MovementType,
  reason: string | null = null,
): Promise<void> {
  const ts = nowISO();
  const existing = await db.inventory
    .where('itemId')
    .equals(itemId)
    .and((i) => i.deletedAt === null)
    .first();
  const old = existing ? Number(existing.qtyOnHand) : 0;
  const invId = existing?.id ?? uuidv7();
  await db.inventory.put({
    id: invId,
    householdId: hid(),
    itemId,
    qtyOnHand: newQty,
    countedAt: ts,
    updatedAt: ts,
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({
    method: 'PUT',
    path: '/shopping/inventory',
    body: { id: invId, itemId, qtyOnHand: newQty },
    rowId: invId,
  });

  const delta = round3(newQty - old);
  if (delta !== 0 || reason || type === 'count') {
    const movId = uuidv7();
    await db.movements.put({
      id: movId,
      householdId: hid(),
      itemId,
      type,
      qty: delta,
      balanceAfter: newQty,
      reason,
      movedAt: ts,
      updatedAt: ts,
      deletedAt: null,
      serverVersion: 0,
    });
    await enqueue({
      method: 'POST',
      path: '/shopping/movements',
      body: { id: movId, itemId, type, qty: delta, balanceAfter: newQty, reason, movedAt: ts },
      rowId: movId,
    });
  }
}

/** Contagem absoluta (inventário manual / contagem física). */
export function setInventory(itemId: string, qtyOnHand: number): Promise<void> {
  return recordInventory(itemId, qtyOnHand, 'count');
}

/** Ajuste manual com motivo (correção). */
export function adjustInventory(itemId: string, newQty: number, reason: string): Promise<void> {
  return recordInventory(itemId, newQty, 'adjustment', reason.trim() || null);
}

/** Registra consumo: subtrai do saldo (nunca abaixo de zero). */
export async function logConsumption(itemId: string, used: number): Promise<void> {
  const existing = await db.inventory
    .where('itemId')
    .equals(itemId)
    .and((i) => i.deletedAt === null)
    .first();
  const old = existing ? Number(existing.qtyOnHand) : 0;
  await recordInventory(itemId, Math.max(round3(old - used), 0), 'consumption');
}

/** Soma ao saldo (compra). */
async function addStock(itemId: string, newQty: number): Promise<void> {
  await recordInventory(itemId, newQty, 'purchase');
}

// ---------- Sessão de compra ----------

/** Linha calculada para a tela de revisão (antes de criar a sessão). */
export interface SessionLine {
  itemId: string;
  recommended: number;
  onHand: number;
  needed: number;
}

/** Calcula o que falta comprar por item de uma lista (recorrente desconta estoque). */
export async function previewSessionLines(listId: string): Promise<SessionLine[]> {
  const [list, entries, inventory] = await Promise.all([
    db.lists.get(listId),
    db.listEntries.where('listId').equals(listId).filter((e) => e.deletedAt === null).toArray(),
    db.inventory.filter((i) => i.deletedAt === null).toArray(),
  ]);
  if (!list) return [];
  const onHandMap = new Map(inventory.map((i) => [i.itemId, Number(i.qtyOnHand)]));
  return entries.map((e) => {
    const onHand = onHandMap.get(e.itemId) ?? 0;
    return {
      itemId: e.itemId,
      recommended: e.qty,
      onHand,
      needed: list.isRecurring ? neededQty(e.qty, onHand) : e.qty,
    };
  });
}

/**
 * Inicia sessão a partir de uma lista. Snapshot das quantidades necessárias
 * (recorrente desconta inventário) e da estimativa (loja mais barata atual).
 */
export async function startShoppingSession(listId: string): Promise<string> {
  const lines = await previewSessionLines(listId);
  return startShoppingSessionWith(
    listId,
    lines.filter((l) => l.needed > 0).map((l) => ({ itemId: l.itemId, neededQty: l.needed })),
  );
}

/** Cria a sessão com as linhas já revisadas (qtd ajustada / itens excluídos). */
export async function startShoppingSessionWith(
  listId: string,
  lines: { itemId: string; neededQty: number }[],
): Promise<string> {
  const prices = await db.prices.filter((p) => p.deletedAt === null).toArray();
  const sessionId = uuidv7();
  const ts = nowISO();

  const items = lines.map((line) => {
    const cheapest = cheapestStore(prices.filter((p) => p.itemId === line.itemId));
    return {
      id: uuidv7(),
      itemId: line.itemId,
      neededQty: line.neededQty,
      estimatedUnitPriceCents: cheapest?.priceCents ?? null,
      estimatedPriceStoreId: cheapest?.storeId ?? null,
    };
  });

  await db.sessions.put({
    id: sessionId,
    householdId: hid(),
    listId,
    storeId: null,
    status: 'active',
    startedAt: ts,
    completedAt: null,
    receiptKey: null,
    updatedAt: ts,
    deletedAt: null,
    serverVersion: 0,
  });
  await db.sessionItems.bulkPut(
    items.map((it) => ({
      id: it.id,
      householdId: hid(),
      sessionId,
      itemId: it.itemId,
      neededQty: it.neededQty,
      estimatedUnitPriceCents: it.estimatedUnitPriceCents,
      estimatedPriceStoreId: it.estimatedPriceStoreId,
      checkedAt: null,
      actualBrandId: null,
      actualQty: null,
      actualUnitPriceCents: null,
      updatedAt: ts,
      deletedAt: null,
      serverVersion: 0,
    })),
  );
  await enqueue({
    method: 'POST',
    path: '/shopping/sessions',
    body: { id: sessionId, listId, startedAt: ts, items },
    rowId: sessionId,
  });
  return sessionId;
}

/** Marca item da sessão como comprado: registra preço real (da marca) + atualiza o item. */
export async function checkSessionItem(
  sessionItemId: string,
  itemId: string,
  storeId: string,
  actualQty: number,
  actualUnitPriceCents: number,
  brandId: string | null = null,
  rating: number | null = null,
): Promise<void> {
  await recordPrice(itemId, storeId, actualUnitPriceCents, brandId, rating);
  const ts = nowISO();
  await db.sessionItems.update(sessionItemId, {
    checkedAt: ts,
    actualBrandId: brandId,
    actualQty,
    actualUnitPriceCents,
    updatedAt: ts,
  });
  await enqueue({
    method: 'PATCH',
    path: `/shopping/sessions/items/${sessionItemId}`,
    body: { checkedAt: ts, actualBrandId: brandId, actualQty, actualUnitPriceCents },
    rowId: sessionItemId,
  });
}

export async function uncheckSessionItem(sessionItemId: string): Promise<void> {
  await db.sessionItems.update(sessionItemId, {
    checkedAt: null,
    actualBrandId: null,
    actualQty: null,
    actualUnitPriceCents: null,
    updatedAt: nowISO(),
  });
  await enqueue({
    method: 'PATCH',
    path: `/shopping/sessions/items/${sessionItemId}`,
    body: { checkedAt: null, actualBrandId: null, actualQty: null, actualUnitPriceCents: null },
    rowId: sessionItemId,
  });
}

/** Define a loja ativa da sessão de compra (gruda como padrão dos próximos itens). */
export async function setSessionStore(sessionId: string, storeId: string): Promise<void> {
  await db.sessions.update(sessionId, { storeId, updatedAt: nowISO() });
  await enqueue({ method: 'PATCH', path: `/shopping/sessions/${sessionId}`, body: { storeId }, rowId: sessionId });
}

/** Adiciona um item à sessão em andamento (compra fora da lista). */
export async function addSessionItem(sessionId: string, itemId: string): Promise<string> {
  const id = uuidv7();
  const ts = nowISO();
  const prices = await db.prices.filter((p) => p.deletedAt === null && p.itemId === itemId).toArray();
  const cheapest = cheapestStore(prices);
  await db.sessionItems.put({
    id,
    householdId: hid(),
    sessionId,
    itemId,
    neededQty: 1,
    estimatedUnitPriceCents: cheapest?.priceCents ?? null,
    estimatedPriceStoreId: cheapest?.storeId ?? null,
    checkedAt: null,
    actualBrandId: null,
    actualQty: null,
    actualUnitPriceCents: null,
    updatedAt: ts,
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({
    method: 'POST',
    path: `/shopping/sessions/${sessionId}/items`,
    body: {
      id,
      itemId,
      neededQty: 1,
      estimatedUnitPriceCents: cheapest?.priceCents ?? null,
      estimatedPriceStoreId: cheapest?.storeId ?? null,
    },
    rowId: id,
  });
  return id;
}

/** Anexa a foto do recibo à sessão (blob local; upload R2 fica pra depois). */
export async function setSessionReceipt(sessionId: string, blob: Blob): Promise<void> {
  await db.sessions.update(sessionId, { receiptBlob: blob, updatedAt: nowISO() });
}

export async function completeSession(sessionId: string): Promise<void> {
  const ts = nowISO();
  // SILO: compra de lista PRIVADA não toca o estoque compartilhado da casa
  // (senão o movimento de estoque vazaria a compra pros outros membros).
  const session = await db.sessions.get(sessionId);
  const list = session?.listId ? await db.lists.get(session.listId) : null;
  const isPrivate = list?.isPrivate ?? false;

  if (!isPrivate) {
    // o que foi comprado volta para o estoque de casa
    const bought = await db.sessionItems
      .where('sessionId')
      .equals(sessionId)
      .filter((s) => s.deletedAt === null && s.checkedAt != null && s.actualQty != null)
      .toArray();
    for (const si of bought) {
      const inv = await db.inventory
        .where('itemId')
        .equals(si.itemId)
        .and((i) => i.deletedAt === null)
        .first();
      const current = inv ? Number(inv.qtyOnHand) : 0;
      await addStock(si.itemId, round3(current + Number(si.actualQty)));
    }
  }
  await db.sessions.update(sessionId, { status: 'completed', completedAt: ts, updatedAt: ts });
  await enqueue({
    method: 'PATCH',
    path: `/shopping/sessions/${sessionId}`,
    body: { status: 'completed', completedAt: ts },
    rowId: sessionId,
  });
}

// tipos reexportados pra telas que ainda referenciam
export type {
  LocalBrand,
  LocalCategory,
  LocalComment,
  LocalInventory,
  LocalMovement,
  LocalItem,
  LocalList,
  LocalListEntry,
  LocalPrice,
  LocalSession,
  LocalSessionItem,
  LocalStore,
};
