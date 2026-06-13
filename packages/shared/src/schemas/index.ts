import { z } from 'zod';

/** Datas trafegam como ISO 8601 string (wire + local store). */
const isoDate = z.iso.datetime({ offset: true });

/** Colunas presentes em toda entidade syncável. */
export const syncMetaSchema = z.object({
  id: z.uuid(),
  householdId: z.uuid(),
  updatedAt: isoDate,
  deletedAt: isoDate.nullable(),
});
export type SyncMeta = z.infer<typeof syncMetaSchema>;

export const UNITS = ['un', 'kg', 'g', 'l', 'ml'] as const;
export const unitSchema = z.enum(UNITS);
export type Unit = z.infer<typeof unitSchema>;

export const itemSchema = syncMetaSchema.extend({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100).nullable(),
  photoKey: z.string().max(500).nullable(),
  unit: unitSchema,
});
export type Item = z.infer<typeof itemSchema>;

export const itemBarcodeSchema = syncMetaSchema.extend({
  itemId: z.uuid(),
  /** EAN-8/EAN-13 como texto — preserva zeros à esquerda. */
  barcode: z.string().regex(/^\d{8,14}$/),
});
export type ItemBarcode = z.infer<typeof itemBarcodeSchema>;

export const storeSchema = syncMetaSchema.extend({
  name: z.string().trim().min(1).max(200),
  city: z.string().trim().max(100).nullable(),
  neighborhood: z.string().trim().max(100).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});
export type Store = z.infer<typeof storeSchema>;

export const PRICE_SOURCES = ['manual', 'shopping'] as const;

export const priceRecordSchema = syncMetaSchema.extend({
  itemId: z.uuid(),
  storeId: z.uuid(),
  priceCents: z.number().int().positive(),
  recordedAt: isoDate,
  source: z.enum(PRICE_SOURCES),
});
export type PriceRecord = z.infer<typeof priceRecordSchema>;

/** Quantidades: até 3 casas decimais (1.5 kg, 0.250 g). */
const qty = z.number().nonnegative().multipleOf(0.001);

/**
 * Listas de compras nomeadas — "Compras do mês", "Churrasco", "Aniversário".
 * isRecurring: lista entra no ciclo mensal (inventário desconta o que tem em casa).
 * Não-recorrente: quantidade da entrada é o que comprar, direto.
 */
export const shoppingListSchema = syncMetaSchema.extend({
  name: z.string().trim().min(1).max(100),
  isRecurring: z.boolean(),
});
export type ShoppingList = z.infer<typeof shoppingListSchema>;

export const shoppingListEntrySchema = syncMetaSchema.extend({
  listId: z.uuid(),
  itemId: z.uuid(),
  /** Recorrente: padrão mensal. Não-recorrente: quantidade planejada. */
  qty: qty.refine((v) => v > 0, 'quantidade deve ser positiva'),
});
export type ShoppingListEntry = z.infer<typeof shoppingListEntrySchema>;

export const inventoryCountSchema = syncMetaSchema.extend({
  itemId: z.uuid(),
  qtyOnHand: qty,
  countedAt: isoDate,
});
export type InventoryCount = z.infer<typeof inventoryCountSchema>;

export const SESSION_STATUSES = ['active', 'completed', 'abandoned'] as const;

export const shoppingSessionSchema = syncMetaSchema.extend({
  listId: z.uuid().nullable(),
  storeId: z.uuid().nullable(),
  status: z.enum(SESSION_STATUSES),
  startedAt: isoDate,
  completedAt: isoDate.nullable(),
});
export type ShoppingSession = z.infer<typeof shoppingSessionSchema>;

export const shoppingSessionItemSchema = syncMetaSchema.extend({
  sessionId: z.uuid(),
  itemId: z.uuid(),
  neededQty: qty,
  estimatedUnitPriceCents: z.number().int().positive().nullable(),
  estimatedPriceStoreId: z.uuid().nullable(),
  checkedAt: isoDate.nullable(),
  actualQty: qty.nullable(),
  actualUnitPriceCents: z.number().int().positive().nullable(),
});
export type ShoppingSessionItem = z.infer<typeof shoppingSessionItemSchema>;

/** Registro de tabelas syncáveis — fonte única pro engine de sync e endpoints. */
export const SYNC_TABLES = {
  items: itemSchema,
  item_barcodes: itemBarcodeSchema,
  stores: storeSchema,
  price_records: priceRecordSchema,
  shopping_lists: shoppingListSchema,
  shopping_list_entries: shoppingListEntrySchema,
  inventory_counts: inventoryCountSchema,
  shopping_sessions: shoppingSessionSchema,
  shopping_session_items: shoppingSessionItemSchema,
} as const;
export type SyncTableName = keyof typeof SYNC_TABLES;
