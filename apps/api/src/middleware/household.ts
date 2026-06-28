import { and, eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { auth } from '../auth.js';
import { db } from '../db/index.js';
import { householdMembers, households } from '../db/schema.js';
import { resolveActiveHouseholdId } from '../lib/active-household.js';
import { pokeHousehold } from '../lib/poke.js';
import type { AuthEnv } from './session.js';

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface HouseholdEnv {
  Variables: AuthEnv['Variables'] & {
    householdId: string;
    plan: 'free' | 'pro';
    role: MemberRole;
  };
}

/**
 * Garante sessão + carrega a casa do usuário.
 * household_id vem SEMPRE da sessão, nunca do body — base da autorização.
 */
export const requireHousehold = createMiddleware<HouseholdEnv>(async (c, next) => {
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!sessionData) return c.json({ error: 'not_authenticated' }, 401);
  c.set('user', sessionData.user);
  c.set('session', sessionData.session);

  // Casa ATIVA (multi-casa) — resolvida do servidor, nunca do body.
  const activeId = await resolveActiveHouseholdId(sessionData.user.id);
  if (!activeId) return c.json({ error: 'no_household' }, 403);

  const rows = await db
    .select({
      householdId: householdMembers.householdId,
      plan: households.plan,
      role: householdMembers.role,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(
      and(eq(householdMembers.userId, sessionData.user.id), eq(householdMembers.householdId, activeId)),
    )
    .limit(1);

  const membership = rows[0];
  if (!membership) return c.json({ error: 'no_household' }, 403);

  // viewer é somente-leitura: bloqueia mutações
  const method = c.req.method;
  if (membership.role === 'viewer' && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    return c.json({ error: 'read_only' }, 403);
  }

  c.set('householdId', membership.householdId);
  c.set('plan', membership.plan);
  c.set('role', membership.role as MemberRole);
  await next();

  // mutação concluída → avisa os outros membros (SSE) a sincronizar
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && c.res.status < 400) {
    pokeHousehold(membership.householdId);
  }
});
