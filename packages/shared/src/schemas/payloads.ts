import { z } from 'zod';
import { itemSchema, storeSchema, unitSchema } from './index.js';

const qty = z.number().nonnegative().multipleOf(0.001);
const positiveQty = qty.refine((v) => v > 0, 'quantidade deve ser positiva');
const isoDate = z.iso.datetime({ offset: true });

const barcode = z.string().regex(/^\d{8,14}$/, 'barcode_invalid');

// ---------- Marcas ----------
export const createBrandPayload = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  name: z.string().trim().min(1).max(100),
  isPreferred: z.boolean().optional(),
});
export type CreateBrandPayload = z.infer<typeof createBrandPayload>;

export const updateBrandPayload = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  isPreferred: z.boolean().optional(),
});
export type UpdateBrandPayload = z.infer<typeof updateBrandPayload>;

// ---------- Categorias ----------
export const createCategoryPayload = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  icon: z.string().max(16).nullable().optional(),
  color: z.string().max(16).nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export type CreateCategoryPayload = z.infer<typeof createCategoryPayload>;

export const updateCategoryPayload = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  icon: z.string().max(16).nullable().optional(),
  color: z.string().max(16).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isHidden: z.boolean().optional(),
});
export type UpdateCategoryPayload = z.infer<typeof updateCategoryPayload>;

/** Reordenação em lote: lista de ids na nova ordem. */
export const reorderCategoriesPayload = z.object({
  ids: z.array(z.uuid()).max(200),
});
export type ReorderCategoriesPayload = z.infer<typeof reorderCategoriesPayload>;

/** Payload de criação de item (id gerado no client, com barcodes embutidos). */
export const createItemPayload = z.object({
  id: z.uuid(),
  name: itemSchema.shape.name,
  category: itemSchema.shape.category.optional(),
  categoryId: itemSchema.shape.categoryId.optional(),
  photoKey: itemSchema.shape.photoKey.optional(),
  notes: itemSchema.shape.notes.optional(),
  minStock: itemSchema.shape.minStock.optional(),
  unit: unitSchema.default('un'),
  barcodes: z
    .array(z.object({ id: z.uuid(), barcode, brandId: z.uuid().nullable().optional() }))
    .max(20)
    .default([]),
});
export type CreateItemPayload = z.infer<typeof createItemPayload>;

export const updateItemPayload = z.object({
  name: itemSchema.shape.name.optional(),
  category: itemSchema.shape.category.optional(),
  categoryId: itemSchema.shape.categoryId.optional(),
  photoKey: itemSchema.shape.photoKey.optional(),
  notes: itemSchema.shape.notes.optional(),
  minStock: itemSchema.shape.minStock.optional(),
  unit: unitSchema.optional(),
});
export type UpdateItemPayload = z.infer<typeof updateItemPayload>;

// ---------- Movimentos de estoque ----------
export const createMovementPayload = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  type: z.enum(['purchase', 'consumption', 'adjustment', 'count']),
  qty: z.number().multipleOf(0.001),
  balanceAfter: z.number().nonnegative().multipleOf(0.001),
  reason: z.string().trim().max(200).nullable().optional(),
  movedAt: isoDate.optional(),
});
export type CreateMovementPayload = z.infer<typeof createMovementPayload>;

export const addBarcodePayload = z.object({
  id: z.uuid(),
  barcode,
  brandId: z.uuid().nullable().optional(),
});
export type AddBarcodePayload = z.infer<typeof addBarcodePayload>;

export const createStorePayload = z.object({
  id: z.uuid(),
  name: storeSchema.shape.name,
  city: storeSchema.shape.city.optional(),
  neighborhood: storeSchema.shape.neighborhood.optional(),
  lat: storeSchema.shape.lat.optional(),
  lng: storeSchema.shape.lng.optional(),
  cnpj: storeSchema.shape.cnpj.optional(),
});
export type CreateStorePayload = z.infer<typeof createStorePayload>;

export const updateStorePayload = z.object({
  name: storeSchema.shape.name.optional(),
  city: storeSchema.shape.city.optional(),
  neighborhood: storeSchema.shape.neighborhood.optional(),
  lat: storeSchema.shape.lat.optional(),
  lng: storeSchema.shape.lng.optional(),
  cnpj: storeSchema.shape.cnpj.optional(),
});
export type UpdateStorePayload = z.infer<typeof updateStorePayload>;

// ---------- Preços ----------

export const createPricePayload = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  brandId: z.uuid().nullable().optional(),
  storeId: z.uuid(),
  priceCents: z.number().int().positive(),
  recordedAt: isoDate.optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
});
export type CreatePricePayload = z.infer<typeof createPricePayload>;

// ---------- Listas ----------

const recurrence = z.enum(['weekly', 'biweekly', 'monthly']);
const recurrenceDay = z.number().int().min(0).max(28);

const budgetCents = z.number().int().nonnegative();

export const createListPayload = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  isRecurring: z.boolean().default(false),
  isPrivate: z.boolean().default(false),
  budgetCents: budgetCents.nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
  color: z.string().max(16).nullable().optional(),
  recurrence: recurrence.nullable().optional(),
  recurrenceDay: recurrenceDay.nullable().optional(),
});
export type CreateListPayload = z.infer<typeof createListPayload>;

export const updateListPayload = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  isRecurring: z.boolean().optional(),
  budgetCents: budgetCents.nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
  color: z.string().max(16).nullable().optional(),
  recurrence: recurrence.nullable().optional(),
  recurrenceDay: recurrenceDay.nullable().optional(),
});
export type UpdateListPayload = z.infer<typeof updateListPayload>;

/** Upsert de entrada da lista (item + qty); idempotente por (lista,item). */
export const setListEntryPayload = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  qty: positiveQty,
  assignedTo: z.string().nullable().optional(),
  assignedToName: z.string().nullable().optional(),
});
export type SetListEntryPayload = z.infer<typeof setListEntryPayload>;

// ---------- Comentários ----------
export const createCommentPayload = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  authorId: z.string().nullable().optional(),
  authorName: z.string().nullable().optional(),
  body: z.string().trim().min(1).max(1000),
});
export type CreateCommentPayload = z.infer<typeof createCommentPayload>;

// ---------- Membros ----------
export const updateMemberPayload = z.object({
  role: z.enum(['admin', 'member', 'viewer']),
});
export type UpdateMemberPayload = z.infer<typeof updateMemberPayload>;

// ---------- Inventário ----------

/** Upsert da contagem de estoque de um item. */
export const setInventoryPayload = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  qtyOnHand: qty,
});
export type SetInventoryPayload = z.infer<typeof setInventoryPayload>;

// ---------- Sessão de compra ----------

export const createSessionPayload = z.object({
  id: z.uuid(),
  listId: z.uuid().nullable().optional(),
  storeId: z.uuid().nullable().optional(),
  startedAt: isoDate.optional(),
  items: z
    .array(
      z.object({
        id: z.uuid(),
        itemId: z.uuid(),
        neededQty: qty,
        estimatedUnitPriceCents: z.number().int().positive().nullable().optional(),
        estimatedPriceStoreId: z.uuid().nullable().optional(),
      }),
    )
    .max(500),
});
export type CreateSessionPayload = z.infer<typeof createSessionPayload>;

export const updateSessionPayload = z.object({
  status: z.enum(['active', 'completed', 'abandoned']).optional(),
  storeId: z.uuid().nullable().optional(),
  completedAt: isoDate.nullable().optional(),
  receiptKey: z.string().max(500).nullable().optional(),
});
export type UpdateSessionPayload = z.infer<typeof updateSessionPayload>;

export const updateSessionItemPayload = z.object({
  checkedAt: isoDate.nullable().optional(),
  actualBrandId: z.uuid().nullable().optional(),
  actualQty: qty.nullable().optional(),
  actualUnitPriceCents: z.number().int().positive().nullable().optional(),
});
export type UpdateSessionItemPayload = z.infer<typeof updateSessionItemPayload>;

/** Adiciona um item à sessão já em andamento (quick-add fora da lista). */
export const addSessionItemPayload = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  neededQty: qty,
  estimatedUnitPriceCents: z.number().int().positive().nullable().optional(),
  estimatedPriceStoreId: z.uuid().nullable().optional(),
});
export type AddSessionItemPayload = z.infer<typeof addSessionItemPayload>;
