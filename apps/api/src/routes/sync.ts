import { and, eq, gt } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  categories,
  inventoryCounts,
  itemBarcodes,
  itemBrands,
  items,
  priceRecords,
  shoppingListEntries,
  shoppingLists,
  shoppingSessionItems,
  shoppingSessions,
  stockMovements,
  stores,
} from '../db/schema.js';
import { requireHousehold, type HouseholdEnv } from '../middleware/household.js';

/** Tabelas sync expostas no pull, nome (chave do client) → tabela drizzle. */
const TABLES = {
  categories,
  items,
  item_brands: itemBrands,
  item_barcodes: itemBarcodes,
  stores,
  price_records: priceRecords,
  shopping_lists: shoppingLists,
  shopping_list_entries: shoppingListEntries,
  inventory_counts: inventoryCounts,
  stock_movements: stockMovements,
  shopping_sessions: shoppingSessions,
  shopping_session_items: shoppingSessionItems,
} as const;

export const syncRoute = new Hono<HouseholdEnv>()
  .use(requireHousehold)

  /**
   * Pull incremental: linhas com server_version > cursor (inclui tombstones).
   * Cursor=0 = bootstrap. Retorna novo cursor (maior server_version visto).
   */
  .get('/pull', async (c) => {
    const hid = c.get('householdId');
    const cursor = Number(c.req.query('cursor') ?? 0);

    const entries = await Promise.all(
      Object.entries(TABLES).map(async ([name, table]) => {
        const rows = await db
          .select()
          .from(table)
          .where(and(eq(table.householdId, hid), gt(table.serverVersion, cursor)));
        return [name, rows] as const;
      }),
    );

    let newCursor = cursor;
    const changes: Record<string, unknown[]> = {};
    for (const [name, rows] of entries) {
      changes[name] = rows;
      for (const row of rows) {
        if (row.serverVersion > newCursor) newCursor = row.serverVersion;
      }
    }

    return c.json({ changes, cursor: newCursor });
  });
