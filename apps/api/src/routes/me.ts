import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  households,
  inventoryCounts,
  itemBarcodes,
  items,
  priceRecords,
  shoppingListEntries,
  shoppingLists,
  shoppingSessionItems,
  shoppingSessions,
  stores,
  user,
} from '../db/schema.js';
import { requireHousehold, type HouseholdEnv } from '../middleware/household.js';

export const meRoute = new Hono<HouseholdEnv>()
  .use(requireHousehold)

  /** Exporta todos os dados da casa (LGPD — direito de portabilidade). */
  .get('/export', async (c) => {
    const hid = c.get('householdId');
    const tables = {
      items,
      item_barcodes: itemBarcodes,
      stores,
      price_records: priceRecords,
      shopping_lists: shoppingLists,
      shopping_list_entries: shoppingListEntries,
      inventory_counts: inventoryCounts,
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
    await db.transaction(async (tx) => {
      // apaga a casa (cascade remove todo o domínio + memberships)
      await tx.delete(households).where(eq(households.id, hid));
      // apaga o usuário (cascade remove sessions/accounts do better-auth)
      await tx.delete(user).where(eq(user.id, userId));
    });
    return c.json({ ok: true });
  });
