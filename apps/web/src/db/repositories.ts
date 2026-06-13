import type { Unit } from '@grosify/shared';
import { v7 as uuidv7 } from 'uuid';
import { api } from '../lib/api.js';
import {
  db,
  type LocalInventory,
  type LocalItem,
  type LocalList,
  type LocalListEntry,
  type LocalPrice,
} from './dexie.js';

/**
 * Camada de repositório: gera id no client, escreve na API, cacheia no Dexie.
 * UI lê do Dexie (reativo). Na fase 3 isto vira local-first + outbox sem mexer na UI.
 */

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'request_failed');
  }
  return res.json();
}

// ---------- Pull inicial ----------

/** Puxa catálogo do servidor e popula o Dexie, preservando fotos locais. */
export async function pullCatalog(): Promise<void> {
  const [itemsRes, storesRes] = await Promise.all([
    api.catalog.items.$get(),
    api.catalog.stores.$get(),
  ]);
  const itemsData = (await jsonOrThrow(itemsRes)) as {
    items: (LocalItem & { barcodes: unknown[] })[];
  };
  const storesData = (await jsonOrThrow(storesRes)) as { stores: unknown[] };

  const existingPhotos = new Map<string, Blob | null | undefined>();
  for (const it of await db.items.toArray()) existingPhotos.set(it.id, it.photoBlob);

  await db.transaction('rw', db.items, db.barcodes, db.stores, async () => {
    await Promise.all([db.items.clear(), db.barcodes.clear(), db.stores.clear()]);
    for (const item of itemsData.items) {
      const { barcodes, ...rest } = item;
      await db.items.put({ ...rest, photoBlob: existingPhotos.get(item.id) ?? null });
      await db.barcodes.bulkPut(barcodes as never);
    }
    await db.stores.bulkPut(storesData.stores as never);
  });
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
  const barcodeRows = input.barcodes.map((barcode) => ({ id: uuidv7(), barcode }));
  const res = await api.catalog.items.$post({
    json: {
      id,
      name: input.name,
      category: input.category ?? undefined,
      unit: input.unit,
      barcodes: barcodeRows,
    },
  });
  const data = (await jsonOrThrow(res)) as { item: LocalItem & { barcodes: never[] } };
  const { barcodes, ...item } = data.item;
  await db.items.put({ ...item, photoBlob: input.photoBlob ?? null });
  await db.barcodes.bulkPut(barcodes);
  return id;
}

export async function updateItem(
  id: string,
  updates: { name?: string; category?: string | null; unit?: Unit; photoBlob?: Blob | null },
): Promise<void> {
  const { photoBlob, ...serverFields } = updates;
  const res = await api.catalog.items[':id'].$patch({
    param: { id },
    json: serverFields,
  });
  const data = (await jsonOrThrow(res)) as { item: LocalItem };
  await db.items.update(id, {
    ...data.item,
    ...(photoBlob !== undefined ? { photoBlob } : {}),
  });
}

export async function deleteItem(id: string): Promise<void> {
  await jsonOrThrow(await api.catalog.items[':id'].$delete({ param: { id } }));
  await db.transaction('rw', db.items, db.barcodes, async () => {
    await db.items.delete(id);
    await db.barcodes.where('itemId').equals(id).delete();
  });
}

export async function addBarcode(itemId: string, barcode: string): Promise<void> {
  const id = uuidv7();
  const res = await api.catalog.items[':id'].barcodes.$post({
    param: { id: itemId },
    json: { id, barcode },
  });
  const data = (await jsonOrThrow(res)) as { barcode: never };
  await db.barcodes.put(data.barcode);
}

export async function removeBarcode(id: string): Promise<void> {
  await jsonOrThrow(await api.catalog.barcodes[':id'].$delete({ param: { id } }));
  await db.barcodes.delete(id);
}

/** Item dono de um código de barras (para dedup no scanner). */
export async function findItemIdByBarcode(barcode: string): Promise<string | null> {
  const local = await db.barcodes.where('barcode').equals(barcode).first();
  if (local) return local.itemId;
  const res = await api.catalog.items['by-barcode'][':barcode'].$get({ param: { barcode } });
  const data = (await jsonOrThrow(res)) as { itemId: string | null };
  return data.itemId;
}

// ---------- Lojas ----------

export interface NewStoreInput {
  name: string;
  city?: string | null;
  neighborhood?: string | null;
}

export async function createStore(input: NewStoreInput): Promise<string> {
  const id = uuidv7();
  const res = await api.catalog.stores.$post({
    json: {
      id,
      name: input.name,
      city: input.city ?? undefined,
      neighborhood: input.neighborhood ?? undefined,
    },
  });
  const data = (await jsonOrThrow(res)) as { store: never };
  await db.stores.put(data.store);
  return id;
}

export async function updateStore(
  id: string,
  updates: { name?: string; city?: string | null; neighborhood?: string | null },
): Promise<void> {
  const res = await api.catalog.stores[':id'].$patch({ param: { id }, json: updates });
  const data = (await jsonOrThrow(res)) as { store: never };
  await db.stores.put(data.store);
}

export async function deleteStore(id: string): Promise<void> {
  await jsonOrThrow(await api.catalog.stores[':id'].$delete({ param: { id } }));
  await db.stores.delete(id);
}

// ============ Fase 2: preços, listas, inventário ============

/** numeric do Postgres chega como string; converte qty/qtyOnHand pra number. */
function numEntry(e: LocalListEntry & { qty: unknown }): LocalListEntry {
  return { ...e, qty: Number(e.qty) };
}
function numInventory(i: LocalInventory & { qtyOnHand: unknown }): LocalInventory {
  return { ...i, qtyOnHand: Number(i.qtyOnHand) };
}

/** Puxa preços, listas, entradas e inventário pro Dexie. */
export async function pullShopping(): Promise<void> {
  const [listsRes, pricesRes, invRes] = await Promise.all([
    api.shopping.lists.$get(),
    api.shopping.prices.$get(),
    api.shopping.inventory.$get(),
  ]);
  const listsData = (await jsonOrThrow(listsRes)) as { lists: LocalList[]; entries: never[] };
  const pricesData = (await jsonOrThrow(pricesRes)) as { prices: LocalPrice[] };
  const invData = (await jsonOrThrow(invRes)) as { inventory: never[] };

  await db.transaction('rw', db.lists, db.listEntries, db.prices, db.inventory, async () => {
    await Promise.all([
      db.lists.clear(),
      db.listEntries.clear(),
      db.prices.clear(),
      db.inventory.clear(),
    ]);
    await db.lists.bulkPut(listsData.lists);
    await db.listEntries.bulkPut(listsData.entries.map(numEntry));
    await db.prices.bulkPut(pricesData.prices);
    await db.inventory.bulkPut(invData.inventory.map(numInventory));
  });
}

// ---------- Listas ----------

export async function createList(name: string, isRecurring: boolean): Promise<string> {
  const id = uuidv7();
  const res = await api.shopping.lists.$post({ json: { id, name, isRecurring } });
  const data = (await jsonOrThrow(res)) as { list: LocalList };
  await db.lists.put(data.list);
  return id;
}

export async function updateList(
  id: string,
  updates: { name?: string; isRecurring?: boolean },
): Promise<void> {
  const res = await api.shopping.lists[':id'].$patch({ param: { id }, json: updates });
  const data = (await jsonOrThrow(res)) as { list: LocalList };
  await db.lists.put(data.list);
}

export async function deleteList(id: string): Promise<void> {
  await jsonOrThrow(await api.shopping.lists[':id'].$delete({ param: { id } }));
  await db.transaction('rw', db.lists, db.listEntries, async () => {
    await db.lists.delete(id);
    await db.listEntries.where('listId').equals(id).delete();
  });
}

/** Define a quantidade de um item na lista (cria ou atualiza). */
export async function setListEntry(listId: string, itemId: string, qty: number): Promise<void> {
  const existing = await db.listEntries
    .where('listId')
    .equals(listId)
    .and((e) => e.itemId === itemId && e.deletedAt === null)
    .first();
  const id = existing?.id ?? uuidv7();
  const res = await api.shopping.lists[':id'].entries.$put({
    param: { id: listId },
    json: { id, itemId, qty },
  });
  const data = (await jsonOrThrow(res)) as { entry: LocalListEntry & { qty: unknown } };
  await db.listEntries.put(numEntry(data.entry));
}

export async function removeListEntry(id: string): Promise<void> {
  await jsonOrThrow(await api.shopping.lists.entries[':id'].$delete({ param: { id } }));
  await db.listEntries.delete(id);
}

// ---------- Preços ----------

export async function recordPrice(
  itemId: string,
  storeId: string,
  priceCents: number,
): Promise<void> {
  const id = uuidv7();
  const res = await api.shopping.prices.$post({
    json: { id, itemId, storeId, priceCents },
  });
  const data = (await jsonOrThrow(res)) as { price: LocalPrice };
  await db.prices.put(data.price);
}

// ---------- Inventário ----------

export async function setInventory(itemId: string, qtyOnHand: number): Promise<void> {
  const existing = await db.inventory
    .where('itemId')
    .equals(itemId)
    .and((i) => i.deletedAt === null)
    .first();
  const id = existing?.id ?? uuidv7();
  const res = await api.shopping.inventory.$put({ json: { id, itemId, qtyOnHand } });
  const data = (await jsonOrThrow(res)) as { count: LocalInventory & { qtyOnHand: unknown } };
  await db.inventory.put(numInventory(data.count));
}
