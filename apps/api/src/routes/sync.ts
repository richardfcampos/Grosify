import { and, eq, gt, notInArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db } from '../db/index.js';
import { hiddenListIds, hiddenSessionIds } from '../lib/list-privacy.js';
import {
  categories,
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
} from '../db/schema.js';
import { subscribePoke } from '../lib/poke.js';
import { requireHousehold, type HouseholdEnv } from '../middleware/household.js';

/** Tabelas sync expostas no pull, nome (chave do client) → tabela drizzle. */
const TABLES = {
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
} as const;

export const syncRoute = new Hono<HouseholdEnv>()
  .use(requireHousehold)

  /**
   * Pull incremental: linhas com server_version > cursor (inclui tombstones).
   * Cursor=0 = bootstrap. Retorna novo cursor (maior server_version visto).
   */
  .get('/pull', async (c) => {
    const hid = c.get('householdId');
    const userId = c.get('user').id;
    const cursor = Number(c.req.query('cursor') ?? 0);

    // SILO: o servidor nunca entrega lista privada de OUTRO membro — nem a lista, nem
    // suas entradas, nem suas sessões/itens de compra. Esta é a fronteira de privacidade.
    const hidden = await hiddenListIds(hid, userId);
    const hiddenSess = await hiddenSessionIds(hid, hidden);
    const privacyFilter = (name: string) => {
      if (name === 'shopping_lists' && hidden.length) return notInArray(shoppingLists.id, hidden);
      if (name === 'shopping_list_entries' && hidden.length)
        return notInArray(shoppingListEntries.listId, hidden);
      if (name === 'shopping_sessions' && hiddenSess.length)
        return notInArray(shoppingSessions.id, hiddenSess);
      if (name === 'shopping_session_items' && hiddenSess.length)
        return notInArray(shoppingSessionItems.sessionId, hiddenSess);
      return undefined;
    };

    const entries = await Promise.all(
      Object.entries(TABLES).map(async ([name, table]) => {
        const rows = await db
          .select()
          .from(table)
          .where(and(eq(table.householdId, hid), gt(table.serverVersion, cursor), privacyFilter(name)));
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
  })

  /** SSE: emite "poke" quando há mutação na casa; o client então faz o pull. */
  .get('/stream', (c) => {
    const hid = c.get('householdId');
    return streamSSE(c, async (stream) => {
      let alive = true;
      const unsub = subscribePoke(hid, () => {
        void stream.writeSSE({ event: 'poke', data: '1' });
      });
      stream.onAbort(() => {
        alive = false;
        unsub();
      });
      // heartbeat pra manter a conexão viva
      while (alive) {
        await stream.writeSSE({ event: 'ping', data: '1' });
        await stream.sleep(25_000);
      }
    });
  });
