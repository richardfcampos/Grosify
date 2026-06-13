import { eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { auth } from '../auth.js';
import { db } from '../db/index.js';
import { householdMembers, households } from '../db/schema.js';
import type { AuthEnv } from './session.js';

export interface HouseholdEnv {
  Variables: AuthEnv['Variables'] & {
    householdId: string;
    plan: 'free' | 'pro';
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

  const rows = await db
    .select({ householdId: householdMembers.householdId, plan: households.plan })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, sessionData.user.id))
    .limit(1);

  const membership = rows[0];
  if (!membership) return c.json({ error: 'no_household' }, 403);

  c.set('householdId', membership.householdId);
  c.set('plan', membership.plan);
  await next();
});
