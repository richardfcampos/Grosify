import { z } from 'zod';

/** Datas trafegam como ISO 8601 string (wire + local store). */
const isoDate = z.iso.datetime({ offset: true });

/** Colunas presentes em toda entidade syncável. */
export const syncMetaSchema = z.object({
  id: z.uuid(),
  householdId: z.uuid(),
  updatedAt: isoDate,
  deletedAt: isoDate.nullable(),
  /** Cursor atribuído pelo servidor (trigger). 0 em linhas locais ainda não sincronizadas. */
  serverVersion: z.number().int().nonnegative(),
});
export type SyncMeta = z.infer<typeof syncMetaSchema>;

export const UNITS = ['un', 'kg', 'g', 'l', 'ml'] as const;
export const unitSchema = z.enum(UNITS);
export type Unit = z.infer<typeof unitSchema>;

/** Categoria de itens (entidade com ícone/cor/ordem). */
export const categorySchema = syncMetaSchema.extend({
  name: z.string().trim().min(1).max(100),
  icon: z.string().max(16).nullable(),
  color: z.string().max(16).nullable(),
  sortOrder: z.number().int(),
  isHidden: z.boolean(),
});
export type Category = z.infer<typeof categorySchema>;

export const itemSchema = syncMetaSchema.extend({
  name: z.string().trim().min(1).max(200),
  /** Cache do nome da categoria (desnormalizado de categorySchema.name). */
  category: z.string().trim().min(1).max(100).nullable(),
  categoryId: z.uuid().nullable(),
  photoKey: z.string().max(500).nullable(),
  /** Observações livres do item. */
  notes: z.string().trim().max(2000).nullable(),
  /** Estoque mínimo (alerta de "acabando"). */
  minStock: z.number().nonnegative().multipleOf(0.001).nullable(),
  unit: unitSchema,
});
export type Item = z.infer<typeof itemSchema>;

/** Marca de um item (opcional). isPreferred: a marca usual (máx. 1 por item). */
export const itemBrandSchema = syncMetaSchema.extend({
  itemId: z.uuid(),
  name: z.string().trim().min(1).max(100),
  isPreferred: z.boolean(),
});
export type ItemBrand = z.infer<typeof itemBrandSchema>;

export const itemBarcodeSchema = syncMetaSchema.extend({
  itemId: z.uuid(),
  /** Marca à qual o código pertence (opcional). */
  brandId: z.uuid().nullable(),
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
  brandId: z.uuid().nullable(),
  storeId: z.uuid(),
  priceCents: z.number().int().positive(),
  recordedAt: isoDate,
  source: z.enum(PRICE_SOURCES),
  /** Avaliação de qualidade (1-5), opcional. */
  rating: z.number().int().min(1).max(5).nullable(),
});
export type PriceRecord = z.infer<typeof priceRecordSchema>;

/** Quantidades: até 3 casas decimais (1.5 kg, 0.250 g). */
const qty = z.number().nonnegative().multipleOf(0.001);

/**
 * Listas de compras nomeadas — "Compras do mês", "Churrasco", "Aniversário".
 * isRecurring: lista entra no ciclo mensal (inventário desconta o que tem em casa).
 * Não-recorrente: quantidade da entrada é o que comprar, direto.
 */
export const RECURRENCES = ['weekly', 'biweekly', 'monthly'] as const;
export const recurrenceSchema = z.enum(RECURRENCES);
export type Recurrence = z.infer<typeof recurrenceSchema>;

export const shoppingListSchema = syncMetaSchema.extend({
  name: z.string().trim().min(1).max(100),
  isRecurring: z.boolean(),
  /** Orçamento mensal em unidades mínimas da moeda. */
  budgetCents: z.number().int().nonnegative().nullable(),
  /** Emoji da lista. */
  icon: z.string().max(16).nullable(),
  /** Cor de destaque (hex). */
  color: z.string().max(16).nullable(),
  /** Frequência quando recorrente; null = avulsa. */
  recurrence: recurrenceSchema.nullable(),
  /** Dia do ciclo: 0-6 (semana) ou 1-28 (mês). */
  recurrenceDay: z.number().int().min(0).max(28).nullable(),
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

export const MOVEMENT_TYPES = ['purchase', 'consumption', 'adjustment', 'count'] as const;
export const movementTypeSchema = z.enum(MOVEMENT_TYPES);
export type MovementType = z.infer<typeof movementTypeSchema>;

/** Movimento de estoque (ledger append-only). qty é a variação (±). */
export const stockMovementSchema = syncMetaSchema.extend({
  itemId: z.uuid(),
  type: movementTypeSchema,
  qty: z.number().multipleOf(0.001),
  balanceAfter: z.number().nonnegative().multipleOf(0.001),
  reason: z.string().trim().max(200).nullable(),
  movedAt: isoDate,
});
export type StockMovement = z.infer<typeof stockMovementSchema>;

export const SESSION_STATUSES = ['active', 'completed', 'abandoned'] as const;

export const shoppingSessionSchema = syncMetaSchema.extend({
  listId: z.uuid().nullable(),
  storeId: z.uuid().nullable(),
  status: z.enum(SESSION_STATUSES),
  startedAt: isoDate,
  completedAt: isoDate.nullable(),
  /** Foto do recibo (chave R2). */
  receiptKey: z.string().max(500).nullable(),
});
export type ShoppingSession = z.infer<typeof shoppingSessionSchema>;

export const shoppingSessionItemSchema = syncMetaSchema.extend({
  sessionId: z.uuid(),
  itemId: z.uuid(),
  /** Marca comprada (escolhida na compra). */
  actualBrandId: z.uuid().nullable(),
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
  categories: categorySchema,
  items: itemSchema,
  item_brands: itemBrandSchema,
  item_barcodes: itemBarcodeSchema,
  stores: storeSchema,
  price_records: priceRecordSchema,
  shopping_lists: shoppingListSchema,
  shopping_list_entries: shoppingListEntrySchema,
  inventory_counts: inventoryCountSchema,
  stock_movements: stockMovementSchema,
  shopping_sessions: shoppingSessionSchema,
  shopping_session_items: shoppingSessionItemSchema,
} as const;
export type SyncTableName = keyof typeof SYNC_TABLES;
