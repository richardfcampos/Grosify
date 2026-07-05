import { zValidator } from '@hono/zod-validator';
import {
  addBarcodePayload,
  createBrandPayload,
  createCategoryPayload,
  createCommentPayload,
  createItemPayload,
  createStorePayload,
  maxItems,
  reorderCategoriesPayload,
  updateBrandPayload,
  updateCategoryPayload,
  updateItemPayload,
  updateStorePayload,
} from '@grosify/shared';
import { and, count, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import { categories, itemBarcodes, itemBrands, itemComments, items, stores } from '../db/schema.js';
import { logActivity } from '../lib/activity.js';
import { requireHousehold, type HouseholdEnv } from '../middleware/household.js';

/** Erro de violação de unique (Postgres SQLSTATE 23505). Drizzle embrulha em `cause`. */
function isUniqueViolation(err: unknown): boolean {
  const codeOf = (e: unknown) =>
    typeof e === 'object' && e !== null ? (e as { code?: string }).code : undefined;
  return codeOf(err) === '23505' || codeOf((err as { cause?: unknown }).cause) === '23505';
}

export const catalogRoute = new Hono<HouseholdEnv>()
  .use(requireHousehold)

  // ---------- Itens ----------
  .get('/items', async (c) => {
    const hid = c.get('householdId');
    const rows = await db
      .select()
      .from(items)
      .where(and(eq(items.householdId, hid), isNull(items.deletedAt)));
    const barcodes = await db
      .select()
      .from(itemBarcodes)
      .where(and(eq(itemBarcodes.householdId, hid), isNull(itemBarcodes.deletedAt)));
    const byItem = new Map<string, typeof barcodes>();
    for (const b of barcodes) {
      const list = byItem.get(b.itemId) ?? [];
      list.push(b);
      byItem.set(b.itemId, list);
    }
    return c.json({
      items: rows.map((item) => ({ ...item, barcodes: byItem.get(item.id) ?? [] })),
    });
  })

  .get('/items/by-barcode/:barcode', async (c) => {
    const hid = c.get('householdId');
    const rows = await db
      .select({ itemId: itemBarcodes.itemId, brandId: itemBarcodes.brandId })
      .from(itemBarcodes)
      .where(
        and(
          eq(itemBarcodes.householdId, hid),
          eq(itemBarcodes.barcode, c.req.param('barcode')),
          isNull(itemBarcodes.deletedAt),
        ),
      )
      .limit(1);
    return c.json({ itemId: rows[0]?.itemId ?? null, brandId: rows[0]?.brandId ?? null });
  })

  // ---------- Categorias ----------
  .post('/categories', zValidator('json', createCategoryPayload), async (c) => {
    const hid = c.get('householdId');
    const p = c.req.valid('json');
    const [category] = await db
      .insert(categories)
      .values({
        id: p.id,
        householdId: hid,
        name: p.name,
        icon: p.icon ?? null,
        color: p.color ?? null,
        sortOrder: p.sortOrder ?? 0,
      })
      .onConflictDoNothing()
      .returning();
    return c.json({ category: category ?? null }, 201);
  })

  .patch('/categories/:id', zValidator('json', updateCategoryPayload), async (c) => {
    const hid = c.get('householdId');
    const id = c.req.param('id');
    const p = c.req.valid('json');
    const category = await db.transaction(async (tx) => {
      const [cat] = await tx
        .update(categories)
        .set({ ...p, updatedAt: new Date() })
        .where(and(eq(categories.id, id), eq(categories.householdId, hid)))
        .returning();
      // propaga o novo nome para o cache desnormalizado dos itens
      if (cat && p.name !== undefined) {
        await tx
          .update(items)
          .set({ category: p.name, updatedAt: new Date() })
          .where(and(eq(items.householdId, hid), eq(items.categoryId, id)));
      }
      return cat ?? null;
    });
    if (!category) return c.json({ error: 'not_found' }, 404);
    return c.json({ category });
  })

  .post('/categories/reorder', zValidator('json', reorderCategoriesPayload), async (c) => {
    const hid = c.get('householdId');
    const { ids } = c.req.valid('json');
    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx
          .update(categories)
          .set({ sortOrder: i, updatedAt: new Date() })
          .where(and(eq(categories.id, ids[i]!), eq(categories.householdId, hid)));
      }
    });
    return c.json({ ok: true });
  })

  .delete('/categories/:id', async (c) => {
    const hid = c.get('householdId');
    const id = c.req.param('id');
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(categories)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(categories.id, id), eq(categories.householdId, hid)));
      // itens da categoria ficam sem categoria
      await tx
        .update(items)
        .set({ categoryId: null, category: null, updatedAt: now })
        .where(and(eq(items.householdId, hid), eq(items.categoryId, id)));
    });
    return c.json({ ok: true });
  })

  // ---------- Marcas ----------
  .post('/brands', zValidator('json', createBrandPayload), async (c) => {
    const hid = c.get('householdId');
    const p = c.req.valid('json');
    const brand = await db.transaction(async (tx) => {
      // marca preferida é única por item — desmarca as demais
      if (p.isPreferred) {
        await tx
          .update(itemBrands)
          .set({ isPreferred: false, updatedAt: new Date() })
          .where(and(eq(itemBrands.householdId, hid), eq(itemBrands.itemId, p.itemId)));
      }
      const [b] = await tx
        .insert(itemBrands)
        .values({
          id: p.id,
          householdId: hid,
          itemId: p.itemId,
          name: p.name,
          isPreferred: p.isPreferred ?? false,
        })
        .onConflictDoNothing()
        .returning();
      return b ?? null;
    });
    return c.json({ brand }, 201);
  })

  .patch('/brands/:id', zValidator('json', updateBrandPayload), async (c) => {
    const hid = c.get('householdId');
    const id = c.req.param('id');
    const p = c.req.valid('json');
    const brand = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ itemId: itemBrands.itemId })
        .from(itemBrands)
        .where(and(eq(itemBrands.id, id), eq(itemBrands.householdId, hid)))
        .limit(1);
      if (!existing) return null;
      if (p.isPreferred === true) {
        await tx
          .update(itemBrands)
          .set({ isPreferred: false, updatedAt: new Date() })
          .where(and(eq(itemBrands.householdId, hid), eq(itemBrands.itemId, existing.itemId)));
      }
      const [b] = await tx
        .update(itemBrands)
        .set({ ...p, updatedAt: new Date() })
        .where(and(eq(itemBrands.id, id), eq(itemBrands.householdId, hid)))
        .returning();
      return b ?? null;
    });
    if (!brand) return c.json({ error: 'not_found' }, 404);
    return c.json({ brand });
  })

  .delete('/brands/:id', async (c) => {
    const hid = c.get('householdId');
    const now = new Date();
    await db
      .update(itemBrands)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(itemBrands.id, c.req.param('id')), eq(itemBrands.householdId, hid)));
    return c.json({ ok: true });
  })

  .post('/items', zValidator('json', createItemPayload), async (c) => {
    const hid = c.get('householdId');
    const payload = c.req.valid('json');

    const [{ value: itemCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(items)
      .where(and(eq(items.householdId, hid), isNull(items.deletedAt)));
    if (itemCount >= maxItems(c.get('plan'))) {
      return c.json({ error: 'item_limit_reached' }, 403);
    }

    try {
      const created = await db.transaction(async (tx) => {
        // onConflictDoNothing torna o replay da outbox idempotente
        const [item] = await tx
          .insert(items)
          .values({
            id: payload.id,
            householdId: hid,
            name: payload.name,
            category: payload.category ?? null,
            categoryId: payload.categoryId ?? null,
            photoKey: payload.photoKey ?? null,
            notes: payload.notes ?? null,
            minStock: payload.minStock != null ? String(payload.minStock) : null,
            unit: payload.unit,
          })
          .onConflictDoNothing()
          .returning();
        const insertedBarcodes = payload.barcodes.length
          ? await tx
              .insert(itemBarcodes)
              .values(
                payload.barcodes.map((b) => ({
                  id: b.id,
                  householdId: hid,
                  itemId: payload.id,
                  brandId: b.brandId ?? null,
                  barcode: b.barcode,
                })),
              )
              .onConflictDoNothing()
              .returning()
          : [];
        return item ? { ...item, barcodes: insertedBarcodes } : null;
      });
      if (created)
        await logActivity(hid, c.get('user').id, c.get('user').name, 'item_added', payload.name);
      return c.json({ item: created }, 201);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json({ error: 'barcode_exists' }, 409);
      throw err;
    }
  })

  .patch('/items/:id', zValidator('json', updateItemPayload), async (c) => {
    const hid = c.get('householdId');
    const id = c.req.param('id');
    const { minStock, ...rest } = c.req.valid('json');
    // Renomear invalida o embedding cacheado: o vetor guarda o nome antigo, então
    // zeramos a coluna pra forçar re-embedding no próximo matching de NFC-e. Só
    // limpamos quando o nome de fato muda (evita mexer no cache em edições de outros
    // campos como categoria/estoque).
    const renamedTo = rest.name;
    const [item] = await db
      .update(items)
      .set({
        ...rest,
        ...(minStock !== undefined ? { minStock: minStock != null ? String(minStock) : null } : {}),
        ...(renamedTo !== undefined ? { embedding: null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(items.id, id), eq(items.householdId, hid)))
      .returning();
    if (!item) return c.json({ error: 'not_found' }, 404);
    return c.json({ item });
  })

  .delete('/items/:id', async (c) => {
    const hid = c.get('householdId');
    const id = c.req.param('id');
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(items)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(items.id, id), eq(items.householdId, hid)));
      await tx
        .update(itemBarcodes)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(itemBarcodes.itemId, id), eq(itemBarcodes.householdId, hid)));
    });
    return c.json({ ok: true });
  })

  // ---------- Comentários ----------
  .post('/items/:id/comments', zValidator('json', createCommentPayload), async (c) => {
    const hid = c.get('householdId');
    const p = c.req.valid('json');
    const [comment] = await db
      .insert(itemComments)
      .values({
        id: p.id,
        householdId: hid,
        itemId: c.req.param('id'),
        authorId: p.authorId ?? c.get('user').id,
        authorName: p.authorName ?? c.get('user').name,
        body: p.body,
      })
      .onConflictDoNothing()
      .returning();
    return c.json({ comment: comment ?? null }, 201);
  })

  .delete('/comments/:id', async (c) => {
    const hid = c.get('householdId');
    const now = new Date();
    await db
      .update(itemComments)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(itemComments.id, c.req.param('id')), eq(itemComments.householdId, hid)));
    return c.json({ ok: true });
  })

  // ---------- Códigos de barras ----------
  .post('/items/:id/barcodes', zValidator('json', addBarcodePayload), async (c) => {
    const hid = c.get('householdId');
    const { id, barcode, brandId } = c.req.valid('json');
    try {
      const [row] = await db
        .insert(itemBarcodes)
        .values({ id, householdId: hid, itemId: c.req.param('id'), brandId: brandId ?? null, barcode })
        .returning();
      return c.json({ barcode: row }, 201);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json({ error: 'barcode_exists' }, 409);
      throw err;
    }
  })

  .delete('/barcodes/:id', async (c) => {
    const hid = c.get('householdId');
    const now = new Date();
    await db
      .update(itemBarcodes)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(itemBarcodes.id, c.req.param('id')), eq(itemBarcodes.householdId, hid)));
    return c.json({ ok: true });
  })

  // ---------- Lojas ----------
  .get('/stores', async (c) => {
    const hid = c.get('householdId');
    const rows = await db
      .select()
      .from(stores)
      .where(and(eq(stores.householdId, hid), isNull(stores.deletedAt)));
    return c.json({ stores: rows });
  })

  .post('/stores', zValidator('json', createStorePayload), async (c) => {
    const hid = c.get('householdId');
    const p = c.req.valid('json');
    const [store] = await db
      .insert(stores)
      .values({
        id: p.id,
        householdId: hid,
        name: p.name,
        city: p.city ?? null,
        neighborhood: p.neighborhood ?? null,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
      })
      .onConflictDoNothing()
      .returning();
    return c.json({ store: store ?? null }, 201);
  })

  .patch('/stores/:id', zValidator('json', updateStorePayload), async (c) => {
    const hid = c.get('householdId');
    const [store] = await db
      .update(stores)
      .set({ ...c.req.valid('json'), updatedAt: new Date() })
      .where(and(eq(stores.id, c.req.param('id')), eq(stores.householdId, hid)))
      .returning();
    if (!store) return c.json({ error: 'not_found' }, 404);
    return c.json({ store });
  })

  .delete('/stores/:id', async (c) => {
    const hid = c.get('householdId');
    const now = new Date();
    await db
      .update(stores)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(stores.id, c.req.param('id')), eq(stores.householdId, hid)));
    return c.json({ ok: true });
  });
