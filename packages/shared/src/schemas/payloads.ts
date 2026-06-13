import { z } from 'zod';
import { itemSchema, storeSchema, unitSchema } from './index.js';

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
