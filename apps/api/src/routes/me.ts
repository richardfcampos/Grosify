import { and, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { getBillingProvider } from '../billing/index.js';
import { db } from '../db/index.js';
import {
  categories,
  households,
  inventoryCounts,
  itemBarcodes,
  itemBrands,
  itemComments,
  items,
  priceRecords,
  shoppingListEntries,
  shoppingLists,
  shoppingSessionItems,
  shoppingSessions,
  stockMovements,
  stores,
  subscriptions,
  user,
} from '../db/schema.js';
import { requireHousehold, type HouseholdEnv } from '../middleware/household.js';

export const meRoute = new Hono<HouseholdEnv>()
  .use(requireHousehold)

  /** Exporta todos os dados da casa (LGPD — direito de portabilidade). */
  .get('/export', async (c) => {
    const hid = c.get('householdId');
    const tables = {
      categories,
      items,
      item_brands: itemBrands,
      item_comments: itemComments,
      item_barcodes: itemBarcodes,
      stores,
      price_records: priceRecords,
      shopping_lists: shoppingLists,
      shopping_list_entries: shoppingListEntries,
      inventory_counts: inventoryCounts,
      stock_movements: stockMovements,
      shopping_sessions: shoppingSessions,
      shopping_session_items: shoppingSessionItems,
    };
    const data: Record<string, unknown[]> = {};
    for (const [name, table] of Object.entries(tables)) {
      data[name] = await db.select().from(table).where(eq(table.householdId, hid));
    }
    const [house] = await db.select().from(households).where(eq(households.id, hid));
    return c.json(
      { exportedAt: new Date().toISOString(), household: house, data },
      200,
      { 'Content-Disposition': 'attachment; filename="grosify-export.json"' },
    );
  })

  /**
   * Exclui a conta e, se for owner, a casa inteira (cascade) — LGPD direito de exclusão.
   * Operação irreversível.
   */
  .delete('/', async (c) => {
    const hid = c.get('householdId');
    const userId = c.get('user').id;

    // Cancela a assinatura viva no provider antes do cascade (best-effort) — a linha
    // some com a casa, mas a cobrança recorrente no gateway continuaria se não cancelar.
    const [sub] = await db
      .select({ externalId: subscriptions.externalId, currency: subscriptions.currency })
      .from(subscriptions)
      .where(and(eq(subscriptions.householdId, hid), ne(subscriptions.status, 'canceled')))
      .limit(1);
    if (sub?.externalId) {
      const provider = getBillingProvider(sub.currency);
      if (provider) {
        try {
          await provider.cancelSubscription(sub.externalId);
        } catch (err) {
          console.error('[me:delete] falha ao cancelar assinatura no provider', err);
        }
      }
    }

    await db.transaction(async (tx) => {
      // apaga a casa (cascade remove todo o domínio + memberships)
      await tx.delete(households).where(eq(households.id, hid));
      // apaga o usuário (cascade remove sessions/accounts do better-auth)
      await tx.delete(user).where(eq(user.id, userId));
    });
    return c.json({ ok: true });
  });
