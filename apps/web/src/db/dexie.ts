import type { Item, ItemBarcode, Store } from '@grosify/shared';
import Dexie, { type EntityTable } from 'dexie';

/** Item local: campos do servidor + foto como blob (offline, antes do upload R2). */
export interface LocalItem extends Item {
  photoBlob?: Blob | null;
}
export type LocalBarcode = ItemBarcode;
export type LocalStore = Store;

const db = new Dexie('grosify') as Dexie & {
  items: EntityTable<LocalItem, 'id'>;
  barcodes: EntityTable<LocalBarcode, 'id'>;
  stores: EntityTable<LocalStore, 'id'>;
};

db.version(1).stores({
  items: 'id, householdId, name, category, deletedAt',
  barcodes: 'id, householdId, itemId, barcode, deletedAt',
  stores: 'id, householdId, name, deletedAt',
});

export { db };
