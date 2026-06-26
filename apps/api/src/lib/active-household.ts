import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { householdMembers, user } from '../db/schema.js';

/**
 * Resolve a casa ATIVA do usuário (multi-casa):
 *   1. `user.activeHouseholdId`, se ele ainda for membro dela;
 *   2. senão, a primeira casa por `joinedAt` (e repara `activeHouseholdId`).
 * Retorna null se o usuário não tem casa nenhuma.
 *
 * O reparo lazy cobre os dois casos sem migração de dados: usuário antigo
 * (active = null) e casa ativa que foi deletada/da qual ele saiu (FK vira null).
 */
export async function resolveActiveHouseholdId(userId: string): Promise<string | null> {
  const [u] = await db
    .select({ active: user.activeHouseholdId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const active = u?.active ?? null;
  if (active) {
    const [stillMember] = await db
      .select({ hid: householdMembers.householdId })
      .from(householdMembers)
      .where(and(eq(householdMembers.userId, userId), eq(householdMembers.householdId, active)))
      .limit(1);
    if (stillMember) return active;
  }

  const [first] = await db
    .select({ hid: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .orderBy(asc(householdMembers.joinedAt))
    .limit(1);

  if (!first) return null;
  if (first.hid !== active) {
    await db.update(user).set({ activeHouseholdId: first.hid }).where(eq(user.id, userId));
  }
  return first.hid;
}

/** Troca a casa ativa, validando que o usuário é membro dela. Retorna false se não for. */
export async function setActiveHousehold(userId: string, householdId: string): Promise<boolean> {
  const [member] = await db
    .select({ hid: householdMembers.householdId })
    .from(householdMembers)
    .where(and(eq(householdMembers.userId, userId), eq(householdMembers.householdId, householdId)))
    .limit(1);
  if (!member) return false;
  await db.update(user).set({ activeHouseholdId: householdId }).where(eq(user.id, userId));
  return true;
}
