import { cheapestStore, neededQty, type Unit } from '@grosify/shared';
import { v7 as uuidv7 } from 'uuid';
import { enqueue, householdId, syncNow } from '../sync/engine.js';
import {
  db,
  type LocalBrand,
  type LocalInventory,
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
      unit: input.unit,
      barcodes: barcodeRows,
    },
    rowId: id,
  });
  return id;
}

export async function updateItem(
  id: string,
  updates: { name?: string; category?: string | null; unit?: Unit; photoBlob?: Blob | null },
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

// ---------- Marcas ----------

export async function createBrand(itemId: string, name: string): Promise<string> {
  const id = uuidv7();
  await db.brands.put({
    id,
    householdId: hid(),
    itemId,
    name,
    updatedAt: nowISO(),
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({ method: 'POST', path: '/catalog/brands', body: { id, itemId, name }, rowId: id });
  return id;
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

export async function createList(name: string, isRecurring: boolean): Promise<string> {
  const id = uuidv7();
  await db.lists.put({
    id,
    householdId: hid(),
    name,
    isRecurring,
    updatedAt: nowISO(),
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({ method: 'POST', path: '/shopping/lists', body: { id, name, isRecurring }, rowId: id });
  return id;
}

export async function updateList(
  id: string,
  updates: { name?: string; isRecurring?: boolean },
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
    updatedAt: ts,
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({
    method: 'POST',
    path: '/shopping/prices',
    body: { id, itemId, brandId, storeId, priceCents },
    rowId: id,
  });
}

// ---------- Inventário ----------

export async function setInventory(itemId: string, qtyOnHand: number): Promise<void> {
  const existing = await db.inventory
    .where('itemId')
    .equals(itemId)
    .and((i) => i.deletedAt === null)
    .first();
  const id = existing?.id ?? uuidv7();
  const ts = nowISO();
  await db.inventory.put({
    id,
    householdId: hid(),
    itemId,
    qtyOnHand,
    countedAt: ts,
    updatedAt: ts,
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({ method: 'PUT', path: '/shopping/inventory', body: { id, itemId, qtyOnHand }, rowId: id });
}

// ---------- Sessão de compra ----------

/**
 * Inicia sessão a partir de uma lista. Snapshot das quantidades necessárias
 * (recorrente desconta inventário) e da estimativa (loja mais barata atual).
 */
export async function startShoppingSession(listId: string): Promise<string> {
  const [list, entries, prices, inventory] = await Promise.all([
    db.lists.get(listId),
    db.listEntries.where('listId').equals(listId).filter((e) => e.deletedAt === null).toArray(),
    db.prices.filter((p) => p.deletedAt === null).toArray(),
    db.inventory.filter((i) => i.deletedAt === null).toArray(),
  ]);
  if (!list) throw new Error('list_not_found');

  const onHand = new Map(inventory.map((i) => [i.itemId, i.qtyOnHand]));
  const sessionId = uuidv7();
  const ts = nowISO();

  const items = entries.map((entry) => {
    const need = list.isRecurring ? neededQty(entry.qty, onHand.get(entry.itemId) ?? 0) : entry.qty;
    const cheapest = cheapestStore(prices.filter((p) => p.itemId === entry.itemId));
    return {
      id: uuidv7(),
      itemId: entry.itemId,
      neededQty: need,
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
): Promise<void> {
  await recordPrice(itemId, storeId, actualUnitPriceCents, brandId);
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

export async function completeSession(sessionId: string): Promise<void> {
  const ts = nowISO();
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
  LocalInventory,
  LocalItem,
  LocalList,
  LocalListEntry,
  LocalPrice,
  LocalSession,
  LocalSessionItem,
  LocalStore,
};
