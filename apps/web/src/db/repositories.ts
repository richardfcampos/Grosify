import type { Unit } from '@grosify/shared';
import { v7 as uuidv7 } from 'uuid';
import { enqueue, householdId, syncNow } from '../sync/engine.js';
import {
  db,
  type LocalInventory,
  type LocalItem,
  type LocalList,
  type LocalListEntry,
  type LocalPrice,
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
      barcode: b.barcode,
      updatedAt: ts,
      deletedAt: null,
      serverVersion: 0,
    })),
  );
  await enqueue({
    method: 'POST',
    path: '/catalog/items',
    body: { id, name: input.name, category: input.category ?? undefined, unit: input.unit, barcodes: barcodeRows },
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

export async function addBarcode(itemId: string, barcode: string): Promise<void> {
  const id = uuidv7();
  await db.barcodes.put({
    id,
    householdId: hid(),
    itemId,
    barcode,
    updatedAt: nowISO(),
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({
    method: 'POST',
    path: `/catalog/items/${itemId}/barcodes`,
    body: { id, barcode },
    rowId: id,
  });
}

export async function removeBarcode(id: string): Promise<void> {
  await db.barcodes.update(id, { deletedAt: nowISO() });
  await enqueue({ method: 'DELETE', path: `/catalog/barcodes/${id}`, rowId: id });
}

/** Item dono de um código de barras (dedup no scanner). Local primeiro, API se online. */
export async function findItemIdByBarcode(barcode: string): Promise<string | null> {
  const local = await db.barcodes
    .where('barcode')
    .equals(barcode)
    .and((b) => b.deletedAt === null)
    .first();
  return local?.itemId ?? null;
}

// ---------- Lojas ----------

export interface NewStoreInput {
  name: string;
  city?: string | null;
  neighborhood?: string | null;
}

export async function createStore(input: NewStoreInput): Promise<string> {
  const id = uuidv7();
  await db.stores.put({
    id,
    householdId: hid(),
    name: input.name,
    city: input.city ?? null,
    neighborhood: input.neighborhood ?? null,
    lat: null,
    lng: null,
    updatedAt: nowISO(),
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({
    method: 'POST',
    path: '/catalog/stores',
    body: { id, name: input.name, city: input.city ?? undefined, neighborhood: input.neighborhood ?? undefined },
    rowId: id,
  });
  return id;
}

export async function updateStore(
  id: string,
  updates: { name?: string; city?: string | null; neighborhood?: string | null },
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
): Promise<void> {
  const id = uuidv7();
  const ts = nowISO();
  await db.prices.put({
    id,
    householdId: hid(),
    itemId,
    storeId,
    priceCents,
    recordedAt: ts,
    source: 'manual',
    updatedAt: ts,
    deletedAt: null,
    serverVersion: 0,
  });
  await enqueue({ method: 'POST', path: '/shopping/prices', body: { id, itemId, storeId, priceCents }, rowId: id });
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

// tipos reexportados pra telas que ainda referenciam
export type { LocalInventory, LocalItem, LocalList, LocalListEntry, LocalPrice, LocalStore };
