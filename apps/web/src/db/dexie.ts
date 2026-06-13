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

const db = new Dexie('grosify') as Dexie & {
  items: EntityTable<LocalItem, 'id'>;
  barcodes: EntityTable<LocalBarcode, 'id'>;
  stores: EntityTable<LocalStore, 'id'>;
  prices: EntityTable<LocalPrice, 'id'>;
  lists: EntityTable<LocalList, 'id'>;
  listEntries: EntityTable<LocalListEntry, 'id'>;
  inventory: EntityTable<LocalInventory, 'id'>;
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

export { db };
