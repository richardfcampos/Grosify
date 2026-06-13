import { z } from 'zod';
import { itemSchema, storeSchema, unitSchema } from './index.js';

const qty = z.number().nonnegative().multipleOf(0.001);
const positiveQty = qty.refine((v) => v > 0, 'quantidade deve ser positiva');
const isoDate = z.iso.datetime({ offset: true });

const barcode = z.string().regex(/^\d{8,14}$/, 'barcode_invalid');

/** Payload de criação de item (id gerado no client, com barcodes embutidos). */
export const createItemPayload = z.object({
  id: z.uuid(),
  name: itemSchema.shape.name,
  category: itemSchema.shape.category.optional(),
  photoKey: itemSchema.shape.photoKey.optional(),
  unit: unitSchema.default('un'),
  barcodes: z.array(z.object({ id: z.uuid(), barcode })).max(20).default([]),
});
export type CreateItemPayload = z.infer<typeof createItemPayload>;

export const updateItemPayload = z.object({
  name: itemSchema.shape.name.optional(),
  category: itemSchema.shape.category.optional(),
  photoKey: itemSchema.shape.photoKey.optional(),
  unit: unitSchema.optional(),
});
export type UpdateItemPayload = z.infer<typeof updateItemPayload>;

export const addBarcodePayload = z.object({ id: z.uuid(), barcode });
export type AddBarcodePayload = z.infer<typeof addBarcodePayload>;

export const createStorePayload = z.object({
  id: z.uuid(),
  name: storeSchema.shape.name,
  city: storeSchema.shape.city.optional(),
  neighborhood: storeSchema.shape.neighborhood.optional(),
  lat: storeSchema.shape.lat.optional(),
  lng: storeSchema.shape.lng.optional(),
});
export type CreateStorePayload = z.infer<typeof createStorePayload>;

export const updateStorePayload = z.object({
  name: storeSchema.shape.name.optional(),
  city: storeSchema.shape.city.optional(),
  neighborhood: storeSchema.shape.neighborhood.optional(),
  lat: storeSchema.shape.lat.optional(),
  lng: storeSchema.shape.lng.optional(),
});
export type UpdateStorePayload = z.infer<typeof updateStorePayload>;

// ---------- Preços ----------

export const createPricePayload = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  storeId: z.uuid(),
  priceCents: z.number().int().positive(),
  recordedAt: isoDate.optional(),
});
export type CreatePricePayload = z.infer<typeof createPricePayload>;

// ---------- Listas ----------

export const createListPayload = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  isRecurring: z.boolean().default(false),
});
export type CreateListPayload = z.infer<typeof createListPayload>;

export const updateListPayload = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  isRecurring: z.boolean().optional(),
});
export type UpdateListPayload = z.infer<typeof updateListPayload>;

/** Upsert de entrada da lista (item + qty); idempotente por (lista,item). */
export const setListEntryPayload = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  qty: positiveQty,
});
export type SetListEntryPayload = z.infer<typeof setListEntryPayload>;

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
});
export type UpdateSessionPayload = z.infer<typeof updateSessionPayload>;

export const updateSessionItemPayload = z.object({
  checkedAt: isoDate.nullable().optional(),
  actualQty: qty.nullable().optional(),
  actualUnitPriceCents: z.number().int().positive().nullable().optional(),
});
export type UpdateSessionItemPayload = z.infer<typeof updateSessionItemPayload>;
