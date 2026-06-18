import { zValidator } from '@hono/zod-validator';
import {
  createListPayload,
  createPricePayload,
  createSessionPayload,
  setInventoryPayload,
  setListEntryPayload,
  updateListPayload,
  updateSessionItemPayload,
  updateSessionPayload,
} from '@grosify/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  inventoryCounts,
  priceRecords,
  shoppingListEntries,
  shoppingLists,
  shoppingSessionItems,
  shoppingSessions,
} from '../db/schema.js';
import { requireHousehold, type HouseholdEnv } from '../middleware/household.js';

export const shoppingRoute = new Hono<HouseholdEnv>()
  .use(requireHousehold)

  // ---------- Listas ----------
  .get('/lists', async (c) => {
    const hid = c.get('householdId');
    const lists = await db
      .select()
      .from(shoppingLists)
      .where(and(eq(shoppingLists.householdId, hid), isNull(shoppingLists.deletedAt)));
    const entries = await db
      .select()
      .from(shoppingListEntries)
      .where(and(eq(shoppingListEntries.householdId, hid), isNull(shoppingListEntries.deletedAt)));
    return c.json({ lists, entries });
  })

  .post('/lists', zValidator('json', createListPayload), async (c) => {
    const hid = c.get('householdId');
    const p = c.req.valid('json');
    const [list] = await db
      .insert(shoppingLists)
      .values({ id: p.id, householdId: hid, name: p.name, isRecurring: p.isRecurring })
      .onConflictDoNothing()
      .returning();
    return c.json({ list: list ?? null }, 201);
  })

  .patch('/lists/:id', zValidator('json', updateListPayload), async (c) => {
    const hid = c.get('householdId');
    const [list] = await db
      .update(shoppingLists)
      .set({ ...c.req.valid('json'), updatedAt: new Date() })
      .where(and(eq(shoppingLists.id, c.req.param('id')), eq(shoppingLists.householdId, hid)))
      .returning();
    if (!list) return c.json({ error: 'not_found' }, 404);
    return c.json({ list });
  })

  .delete('/lists/:id', async (c) => {
    const hid = c.get('householdId');
    const id = c.req.param('id');
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(shoppingLists)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(shoppingLists.id, id), eq(shoppingLists.householdId, hid)));
      await tx
        .update(shoppingListEntries)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(shoppingListEntries.listId, id), eq(shoppingListEntries.householdId, hid)));
    });
    return c.json({ ok: true });
  })

  /** Upsert de entrada (item+qty) por (lista,item). */
  .put('/lists/:id/entries', zValidator('json', setListEntryPayload), async (c) => {
    const hid = c.get('householdId');
    const listId = c.req.param('id');
    const p = c.req.valid('json');
    const [entry] = await db
      .insert(shoppingListEntries)
      .values({
        id: p.id,
        householdId: hid,
        listId,
        itemId: p.itemId,
        qty: String(p.qty),
      })
      .onConflictDoUpdate({
        target: [shoppingListEntries.listId, shoppingListEntries.itemId],
        set: { qty: String(p.qty), deletedAt: null, updatedAt: new Date() },
      })
      .returning();
    return c.json({ entry }, 201);
  })

  .delete('/lists/entries/:id', async (c) => {
    const hid = c.get('householdId');
    const now = new Date();
    await db
      .update(shoppingListEntries)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(shoppingListEntries.id, c.req.param('id')),
          eq(shoppingListEntries.householdId, hid),
        ),
      );
    return c.json({ ok: true });
  })

  // ---------- Preços ----------
  .get('/prices', async (c) => {
    const hid = c.get('householdId');
    const rows = await db
      .select()
      .from(priceRecords)
      .where(and(eq(priceRecords.householdId, hid), isNull(priceRecords.deletedAt)));
    return c.json({ prices: rows });
  })

  .post('/prices', zValidator('json', createPricePayload), async (c) => {
    const hid = c.get('householdId');
    const p = c.req.valid('json');
    const [price] = await db
      .insert(priceRecords)
      .values({
        id: p.id,
        householdId: hid,
        itemId: p.itemId,
        brandId: p.brandId ?? null,
        storeId: p.storeId,
        priceCents: p.priceCents,
        recordedAt: p.recordedAt ? new Date(p.recordedAt) : new Date(),
        source: 'manual',
      })
      .onConflictDoNothing()
      .returning();
    return c.json({ price: price ?? null }, 201);
  })

  // ---------- Inventário ----------
  .get('/inventory', async (c) => {
    const hid = c.get('householdId');
    const rows = await db
      .select()
      .from(inventoryCounts)
      .where(and(eq(inventoryCounts.householdId, hid), isNull(inventoryCounts.deletedAt)));
    return c.json({ inventory: rows });
  })

  /** Upsert da contagem por (casa,item). */
  .put('/inventory', zValidator('json', setInventoryPayload), async (c) => {
    const hid = c.get('householdId');
    const p = c.req.valid('json');
    const [count] = await db
      .insert(inventoryCounts)
      .values({
        id: p.id,
        householdId: hid,
        itemId: p.itemId,
        qtyOnHand: String(p.qtyOnHand),
        countedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [inventoryCounts.householdId, inventoryCounts.itemId],
        set: { qtyOnHand: String(p.qtyOnHand), countedAt: new Date(), deletedAt: null, updatedAt: new Date() },
      })
      .returning();
    return c.json({ count }, 201);
  })

  // ---------- Sessões de compra ----------
  .get('/sessions', async (c) => {
    const hid = c.get('householdId');
    const sessions = await db
      .select()
      .from(shoppingSessions)
      .where(and(eq(shoppingSessions.householdId, hid), isNull(shoppingSessions.deletedAt)));
    const sessionItems = await db
      .select()
      .from(shoppingSessionItems)
      .where(and(eq(shoppingSessionItems.householdId, hid), isNull(shoppingSessionItems.deletedAt)));
    return c.json({ sessions, sessionItems });
  })

  .post('/sessions', zValidator('json', createSessionPayload), async (c) => {
    const hid = c.get('householdId');
    const p = c.req.valid('json');
    const session = await db.transaction(async (tx) => {
      const [s] = await tx
        .insert(shoppingSessions)
        .values({
          id: p.id,
          householdId: hid,
          listId: p.listId ?? null,
          storeId: p.storeId ?? null,
          status: 'active',
          startedAt: p.startedAt ? new Date(p.startedAt) : new Date(),
        })
        .onConflictDoNothing()
        .returning();
      if (p.items.length) {
        await tx
          .insert(shoppingSessionItems)
          .values(
            p.items.map((it) => ({
              id: it.id,
              householdId: hid,
              sessionId: p.id,
              itemId: it.itemId,
              neededQty: String(it.neededQty),
              estimatedUnitPriceCents: it.estimatedUnitPriceCents ?? null,
              estimatedPriceStoreId: it.estimatedPriceStoreId ?? null,
            })),
          )
          .onConflictDoNothing();
      }
      return s ?? null;
    });
    return c.json({ session }, 201);
  })

  .patch('/sessions/:id', zValidator('json', updateSessionPayload), async (c) => {
    const hid = c.get('householdId');
    const p = c.req.valid('json');
    const [session] = await db
      .update(shoppingSessions)
      .set({
        ...(p.status !== undefined ? { status: p.status } : {}),
        ...(p.storeId !== undefined ? { storeId: p.storeId } : {}),
        ...(p.completedAt !== undefined
          ? { completedAt: p.completedAt ? new Date(p.completedAt) : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(shoppingSessions.id, c.req.param('id')), eq(shoppingSessions.householdId, hid)))
      .returning();
    if (!session) return c.json({ error: 'not_found' }, 404);
    return c.json({ session });
  })

  .patch('/sessions/items/:id', zValidator('json', updateSessionItemPayload), async (c) => {
    const hid = c.get('householdId');
    const p = c.req.valid('json');
    const [item] = await db
      .update(shoppingSessionItems)
      .set({
        ...(p.checkedAt !== undefined
          ? { checkedAt: p.checkedAt ? new Date(p.checkedAt) : null }
          : {}),
        ...(p.actualBrandId !== undefined ? { actualBrandId: p.actualBrandId } : {}),
        ...(p.actualQty !== undefined
          ? { actualQty: p.actualQty === null ? null : String(p.actualQty) }
          : {}),
        ...(p.actualUnitPriceCents !== undefined
          ? { actualUnitPriceCents: p.actualUnitPriceCents }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(shoppingSessionItems.id, c.req.param('id')), eq(shoppingSessionItems.householdId, hid)),
      )
      .returning();
    if (!item) return c.json({ error: 'not_found' }, 404);
    return c.json({ item });
  });
