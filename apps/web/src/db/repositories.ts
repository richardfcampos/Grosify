import type { Unit } from '@grosify/shared';
import { v7 as uuidv7 } from 'uuid';
import { api } from '../lib/api.js';
import { db, type LocalItem } from './dexie.js';

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
