import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { shoppingLists, shoppingSessions } from '../db/schema.js';

/**
 * Privacidade de listas (silo total). Uma lista privada (`isPrivate`) só é visível
 * pro dono (`ownerId`). A FRONTEIRA real é o servidor nunca ENTREGAR a lista privada
 * de outro membro — nem no sync, nem nas leituras diretas, nem em sub-recursos.
 */

/** Predicado SQL: lista visível pro usuário (compartilhada OU privada dele). */
export function visibleListWhere(userId: string) {
  return or(eq(shoppingLists.isPrivate, false), eq(shoppingLists.ownerId, userId));
}

/** Ids de listas privadas da casa que NÃO são do usuário (a esconder dele). */
export async function hiddenListIds(householdId: string, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: shoppingLists.id })
    .from(shoppingLists)
    .where(
      and(
        eq(shoppingLists.householdId, householdId),
        eq(shoppingLists.isPrivate, true),
        or(isNull(shoppingLists.ownerId), ne(shoppingLists.ownerId, userId)),
      ),
    );
  return rows.map((r) => r.id);
}

/** Ids de sessões de compra ligadas a listas escondidas (pra filtrar sessões/itens). */
export async function hiddenSessionIds(householdId: string, listIds: string[]): Promise<string[]> {
  if (listIds.length === 0) return [];
  const rows = await db
    .select({ id: shoppingSessions.id })
    .from(shoppingSessions)
    .where(and(eq(shoppingSessions.householdId, householdId), inArray(shoppingSessions.listId, listIds)));
  return rows.map((r) => r.id);
}
