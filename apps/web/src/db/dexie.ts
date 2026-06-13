import type {
  InventoryCount,
  Item,
  ItemBarcode,
  PriceRecord,
  ShoppingList,
  ShoppingListEntry,
  Store,
} from '@grosify/shared';
import Dexie, { type EntityTable } from 'dexie';

/** Item local: campos do servidor + foto como blob (offline, antes do upload R2). */
export interface LocalItem extends Item {
  photoBlob?: Blob | null;
}
export type LocalBarcode = ItemBarcode;
export type LocalStore = Store;
export type LocalPrice = PriceRecord;
export type LocalList = ShoppingList;
export type LocalListEntry = ShoppingListEntry;
export type LocalInventory = InventoryCount;

/** Mutação pendente na outbox: replay HTTP quando online. */
export interface OutboxEntry {
  seq?: number;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  /** id da linha afetada (pra proteger contra clobber no pull). */
  rowId: string;
}

export interface MetaEntry {
  key: string;
  value: string;
}

const db = new Dexie('grosify') as Dexie & {
  items: EntityTable<LocalItem, 'id'>;
  barcodes: EntityTable<LocalBarcode, 'id'>;
  stores: EntityTable<LocalStore, 'id'>;
  prices: EntityTable<LocalPrice, 'id'>;
  lists: EntityTable<LocalList, 'id'>;
  listEntries: EntityTable<LocalListEntry, 'id'>;
  inventory: EntityTable<LocalInventory, 'id'>;
  outbox: EntityTable<OutboxEntry, 'seq'>;
  meta: EntityTable<MetaEntry, 'key'>;
};

db.version(1).stores({
  items: 'id, householdId, name, category, deletedAt',
  barcodes: 'id, householdId, itemId, barcode, deletedAt',
  stores: 'id, householdId, name, deletedAt',
});

db.version(2).stores({
  items: 'id, householdId, name, category, deletedAt',
  barcodes: 'id, householdId, itemId, barcode, deletedAt',
  stores: 'id, householdId, name, deletedAt',
  prices: 'id, householdId, itemId, storeId, deletedAt',
  lists: 'id, householdId, deletedAt',
  listEntries: 'id, householdId, listId, itemId, deletedAt',
  inventory: 'id, householdId, itemId, deletedAt',
});

db.version(3).stores({
  items: 'id, householdId, name, category, deletedAt',
  barcodes: 'id, householdId, itemId, barcode, deletedAt',
  stores: 'id, householdId, name, deletedAt',
  prices: 'id, householdId, itemId, storeId, deletedAt',
  lists: 'id, householdId, deletedAt',
  listEntries: 'id, householdId, listId, itemId, deletedAt',
  inventory: 'id, householdId, itemId, deletedAt',
  outbox: '++seq, rowId',
  meta: 'key',
});

export { db };
