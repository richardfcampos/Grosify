import { zValidator } from '@hono/zod-validator';
import {
  addSessionItemPayload,
  createListPayload,
  createMovementPayload,
  createPricePayload,
  createSessionPayload,
  maxLists,
  setInventoryPayload,
  setListEntryPayload,
  updateListPayload,
  updateSessionItemPayload,
  updateSessionPayload,
} from '@grosify/shared';
import { and, count, eq, isNull, notInArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import { logActivity } from '../lib/activity.js';
import { hiddenListIds, visibleListWhere } from '../lib/list-privacy.js';
import { isForeignKeyViolation } from '../lib/pg-errors.js';
import {
  inventoryCounts,
  priceRecords,
  shoppingListEntries,
  shoppingLists,
  shoppingSessionItems,
  shoppingSessions,
  stockMovements,
} from '../db/schema.js';
import { requireHousehold, type HouseholdEnv } from '../middleware/household.js';

export const shoppingRoute = new Hono<HouseholdEnv>()
  .use(requireHousehold)

  // ---------- Listas ----------
  .get('/lists', async (c) => {
    const hid = c.get('householdId');
    const userId = c.get('user').id;
    const lists = await db
      .select()
      .from(shoppingLists)
      .where(
        and(eq(shoppingLists.householdId, hid), isNull(shoppingLists.deletedAt), visibleListWhere(userId)),
      );
    const hidden = await hiddenListIds(hid, userId);
    const entries = await db
      .select()
      .from(shoppingListEntries)
      .where(
        and(
          eq(shoppingListEntries.householdId, hid),
          isNull(shoppingListEntries.deletedAt),
          hidden.length ? notInArray(shoppingListEntries.listId, hidden) : undefined,
        ),
      );
    return c.json({ lists, entries });
  })

  .post('/lists', zValidator('json', createListPayload), async (c) => {
    const hid = c.get('householdId');
    const p = c.req.valid('json');
    // Teto de listas do plano (só as vivas contam; soft-deletadas não). count+insert sem
    // lock é aceito: household é pequeno e o teto é soft-business.
    const [{ value: listCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(shoppingLists)
      .where(and(eq(shoppingLists.householdId, hid), isNull(shoppingLists.deletedAt)));
    if (listCount >= maxLists(c.get('plan'))) {
      return c.json({ error: 'list_limit_reached' }, 403);
    }
    const [list] = await db
      .insert(shoppingLists)
      .values({
        id: p.id,
        householdId: hid,
        name: p.name,
        isRecurring: p.isRecurring,
        isPrivate: p.isPrivate,
        // lista privada pertence a quem criou; compartilhada = sem dono
        ownerId: p.isPrivate ? c.get('user').id : null,
        budgetCents: p.budgetCents ?? null,
        icon: p.icon ?? null,
        color: p.color ?? null,
        recurrence: p.recurrence ?? null,
        recurrenceDay: p.recurrenceDay ?? null,
      })
      .onConflictDoNothing()
      .returning();
    // não loga atividade de lista privada no feed da casa (vazaria a existência)
    if (list && !list.isPrivate)
      await logActivity(hid, c.get('user').id, c.get('user').name, 'list_created', list.name);
    return c.json({ list: list ?? null }, 201);
  })

  .patch('/lists/:id', zValidator('json', updateListPayload), async (c) => {
    const hid = c.get('householdId');
    const userId = c.get('user').id;
    const [list] = await db
      .update(shoppingLists)
      .set({ ...c.req.valid('json'), updatedAt: new Date() })
      // só o dono mexe numa lista privada
      .where(
        and(
          eq(shoppingLists.id, c.req.param('id')),
          eq(shoppingLists.householdId, hid),
          visibleListWhere(userId),
        ),
      )
      .returning();
    if (!list) return c.json({ error: 'not_found' }, 404);
    return c.json({ list });
  })

  .delete('/lists/:id', async (c) => {
    const hid = c.get('householdId');
    const userId = c.get('user').id;
    const id = c.req.param('id');
    // valida acesso (lista privada de outro → 404) antes do soft-delete em cascata
    const [accessible] = await db
      .select({ id: shoppingLists.id })
      .from(shoppingLists)
      .where(and(eq(shoppingLists.id, id), eq(shoppingLists.householdId, hid), visibleListWhere(userId)))
      .limit(1);
    if (!accessible) return c.json({ error: 'not_found' }, 404);
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
    // não deixa adicionar item na lista privada de outro membro
    const [accessible] = await db
      .select({ id: shoppingLists.id })
      .from(shoppingLists)
      .where(
        and(eq(shoppingLists.id, listId), eq(shoppingLists.householdId, hid), visibleListWhere(c.get('user').id)),
      )
      .limit(1);
    if (!accessible) return c.json({ error: 'not_found' }, 404);
    try {
      const [entry] = await db
        .insert(shoppingListEntries)
        .values({
          id: p.id,
          householdId: hid,
          listId,
          itemId: p.itemId,
          qty: String(p.qty),
          assignedTo: p.assignedTo ?? null,
          assignedToName: p.assignedToName ?? null,
        })
        .onConflictDoUpdate({
          target: [shoppingListEntries.listId, shoppingListEntries.itemId],
          set: {
            qty: String(p.qty),
            ...(p.assignedTo !== undefined ? { assignedTo: p.assignedTo } : {}),
            ...(p.assignedToName !== undefined ? { assignedToName: p.assignedToName } : {}),
            deletedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning();
      return c.json({ entry }, 201);
    } catch (err) {
      // A lista ou o item referenciado não existe no servidor (ex.: POST do item foi
      // rejeitado antes — limite de plano/barcode duplicado). FK é determinística:
      // 500 faria a outbox do client retentar pra sempre e travar a fila inteira.
      if (isForeignKeyViolation(err)) return c.json({ error: 'entry_ref_missing' }, 409);
      throw err;
    }
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
    try {
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
          source: p.source ?? 'manual',
          rating: p.rating ?? null,
        })
        .onConflictDoNothing()
        .returning();
      return c.json({ price: price ?? null }, 201);
    } catch (err) {
      // Item/loja referenciados não existem no servidor (ex.: POST do item rejeitado
      // antes por limite de plano). FK é determinística: 4xx encerra a outbox em vez
      // de 500→retry infinito que travaria a fila.
      if (isForeignKeyViolation(err)) return c.json({ error: 'ref_missing' }, 409);
      throw err;
    }
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
    try {
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
    } catch (err) {
      // Item referenciado ausente no servidor (ex.: item rejeitado por limite de plano).
      // FK determinística → 4xx encerra a outbox em vez de 500→retry infinito.
      if (isForeignKeyViolation(err)) return c.json({ error: 'ref_missing' }, 409);
      throw err;
    }
  })

  .post('/movements', zValidator('json', createMovementPayload), async (c) => {
    const hid = c.get('householdId');
    const p = c.req.valid('json');
    try {
      const [movement] = await db
        .insert(stockMovements)
        .values({
          id: p.id,
          householdId: hid,
          itemId: p.itemId,
          type: p.type,
          qty: String(p.qty),
          balanceAfter: String(p.balanceAfter),
          reason: p.reason ?? null,
          movedAt: p.movedAt ? new Date(p.movedAt) : new Date(),
        })
        .onConflictDoNothing()
        .returning();
      return c.json({ movement: movement ?? null }, 201);
    } catch (err) {
      if (isForeignKeyViolation(err)) return c.json({ error: 'ref_missing' }, 409);
      throw err;
    }
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
    try {
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
    } catch (err) {
      // Item de sessão referencia item ausente no servidor (rejeitado por limite antes).
      // FK determinística → 4xx encerra a outbox em vez de 500→retry infinito.
      if (isForeignKeyViolation(err)) return c.json({ error: 'ref_missing' }, 409);
      throw err;
    }
  })

  .post('/sessions/:id/items', zValidator('json', addSessionItemPayload), async (c) => {
    const hid = c.get('householdId');
    const sessionId = c.req.param('id');
    const p = c.req.valid('json');
    try {
      const [row] = await db
        .insert(shoppingSessionItems)
        .values({
          id: p.id,
          householdId: hid,
          sessionId,
          itemId: p.itemId,
          neededQty: String(p.neededQty),
          estimatedUnitPriceCents: p.estimatedUnitPriceCents ?? null,
          estimatedPriceStoreId: p.estimatedPriceStoreId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      return c.json({ item: row ?? null }, 201);
    } catch (err) {
      if (isForeignKeyViolation(err)) return c.json({ error: 'ref_missing' }, 409);
      throw err;
    }
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
        ...(p.receiptKey !== undefined ? { receiptKey: p.receiptKey } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(shoppingSessions.id, c.req.param('id')), eq(shoppingSessions.householdId, hid)))
      .returning();
    if (!session) return c.json({ error: 'not_found' }, 404);
    if (p.status === 'completed') {
      // compra de lista privada não vai pro feed da casa (silo)
      const priv = session.listId
        ? (
            await db
              .select({ isPrivate: shoppingLists.isPrivate })
              .from(shoppingLists)
              .where(eq(shoppingLists.id, session.listId))
              .limit(1)
          )[0]?.isPrivate
        : false;
      if (!priv)
        await logActivity(hid, c.get('user').id, c.get('user').name, 'shopping_completed', null);
    }
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
