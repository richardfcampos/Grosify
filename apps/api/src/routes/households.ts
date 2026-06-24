import { zValidator } from '@hono/zod-validator';
import { isValidCurrency, updateMemberPayload } from '@grosify/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { db } from '../db/index.js';
import { activities, householdInvites, householdMembers, households, user } from '../db/schema.js';
import { logActivity } from '../lib/activity.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { requireSession, type AuthEnv } from '../middleware/session.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Código legível sem ambiguidade (sem 0/O, 1/I/L). */
function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  let code = '';
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

async function membershipOf(userId: string) {
  const rows = await db
    .select({
      householdId: householdMembers.householdId,
      role: householdMembers.role,
      name: households.name,
      plan: households.plan,
      currency: households.currency,
      onboardedAt: householdMembers.onboardedAt,
      themeMode: householdMembers.uiThemeMode,
      themeDir: householdMembers.uiThemeDir,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export const householdsRoute = new Hono<AuthEnv>()
  .use(requireSession)

  .get('/mine', async (c) => {
    const membership = await membershipOf(c.get('user').id);
    return c.json({
      membership: membership && { ...membership, onboarded: membership.onboardedAt != null },
    });
  })

  // Marca que o membro viu o onboarding — persiste na conta (não no aparelho),
  // então não reaparece em outro device nem ao limpar o cache.
  .post('/onboarded', async (c) => {
    const membership = await membershipOf(c.get('user').id);
    if (!membership) return c.json({ error: 'no_household' }, 403);
    await db
      .update(householdMembers)
      .set({ onboardedAt: new Date() })
      .where(
        and(
          eq(householdMembers.householdId, membership.householdId),
          eq(householdMembers.userId, c.get('user').id),
        ),
      );
    return c.json({ ok: true });
  })

  // Preferências visuais do membro (tema claro/escuro/sistema + direção visual).
  // Persiste na conta pra sincronizar entre aparelhos; household_id vem da sessão.
  .post(
    '/settings',
    zValidator(
      'json',
      z.object({
        themeMode: z.enum(['light', 'dark', 'system']).optional(),
        themeDir: z.enum(['painel', 'mercado', 'recibo']).optional(),
      }),
    ),
    async (c) => {
      const membership = await membershipOf(c.get('user').id);
      if (!membership) return c.json({ error: 'no_household' }, 403);
      const body = c.req.valid('json');
      const patch: Partial<{ uiThemeMode: string; uiThemeDir: string }> = {};
      if (body.themeMode !== undefined) patch.uiThemeMode = body.themeMode;
      if (body.themeDir !== undefined) patch.uiThemeDir = body.themeDir;
      if (Object.keys(patch).length > 0) {
        await db
          .update(householdMembers)
          .set(patch)
          .where(
            and(
              eq(householdMembers.householdId, membership.householdId),
              eq(householdMembers.userId, c.get('user').id),
            ),
          );
      }
      return c.json({ ok: true });
    },
  )

  .post(
    '/',
    zValidator(
      'json',
      z.object({
        name: z.string().trim().min(1).max(100),
        currency: z
          .string()
          .length(3)
          .toUpperCase()
          .refine(isValidCurrency, 'invalid_currency')
          .default('BRL'),
      }),
    ),
    async (c) => {
      const userId = c.get('user').id;
      if (await membershipOf(userId)) {
        return c.json({ error: 'already_in_household' }, 409);
      }
      const { name, currency } = c.req.valid('json');
      const id = uuidv7();
      await db.transaction(async (tx) => {
        await tx.insert(households).values({ id, name, currency, createdBy: userId });
        await tx.insert(householdMembers).values({ householdId: id, userId, role: 'owner' });
      });
      return c.json(
        { household: { id, name, currency, plan: 'free' as const, role: 'owner' as const } },
        201,
      );
    },
  )

  .get('/members', async (c) => {
    const membership = await membershipOf(c.get('user').id);
    if (!membership) return c.json({ error: 'no_household' }, 403);
    const members = await db
      .select({
        userId: householdMembers.userId,
        role: householdMembers.role,
        name: user.name,
        email: user.email,
        joinedAt: householdMembers.joinedAt,
      })
      .from(householdMembers)
      .innerJoin(user, eq(user.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, membership.householdId));
    return c.json({ members, me: c.get('user').id, myRole: membership.role });
  })

  .patch('/members/:userId', zValidator('json', updateMemberPayload), async (c) => {
    const membership = await membershipOf(c.get('user').id);
    if (!membership) return c.json({ error: 'no_household' }, 403);
    if (membership.role !== 'owner' && membership.role !== 'admin')
      return c.json({ error: 'forbidden' }, 403);
    const target = c.req.param('userId');
    const [current] = await db
      .select({ role: householdMembers.role })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, membership.householdId),
          eq(householdMembers.userId, target),
        ),
      )
      .limit(1);
    if (!current) return c.json({ error: 'not_found' }, 404);
    if (current.role === 'owner') return c.json({ error: 'cannot_change_owner' }, 403);
    await db
      .update(householdMembers)
      .set({ role: c.req.valid('json').role })
      .where(
        and(
          eq(householdMembers.householdId, membership.householdId),
          eq(householdMembers.userId, target),
        ),
      );
    return c.json({ ok: true });
  })

  .delete('/members/:userId', async (c) => {
    const membership = await membershipOf(c.get('user').id);
    if (!membership) return c.json({ error: 'no_household' }, 403);
    if (membership.role !== 'owner' && membership.role !== 'admin')
      return c.json({ error: 'forbidden' }, 403);
    const target = c.req.param('userId');
    const [current] = await db
      .select({ role: householdMembers.role })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, membership.householdId),
          eq(householdMembers.userId, target),
        ),
      )
      .limit(1);
    if (!current) return c.json({ error: 'not_found' }, 404);
    if (current.role === 'owner') return c.json({ error: 'cannot_remove_owner' }, 403);
    await db
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, membership.householdId),
          eq(householdMembers.userId, target),
        ),
      );
    await logActivity(membership.householdId, c.get('user').id, c.get('user').name, 'member_removed', null);
    return c.json({ ok: true });
  })

  .get('/activities', async (c) => {
    const membership = await membershipOf(c.get('user').id);
    if (!membership) return c.json({ error: 'no_household' }, 403);
    const rows = await db
      .select()
      .from(activities)
      .where(eq(activities.householdId, membership.householdId))
      .orderBy(desc(activities.createdAt))
      .limit(50);
    return c.json({ activities: rows });
  })

  .post('/invites', rateLimit({ windowMs: 60_000, max: 5 }), async (c) => {
    const membership = await membershipOf(c.get('user').id);
    if (!membership) {
      return c.json({ error: 'no_household' }, 403);
    }
    if (membership.role !== 'owner' && membership.role !== 'admin')
      return c.json({ error: 'forbidden' }, 403);
    const code = inviteCode();
    await db.insert(householdInvites).values({
      code,
      householdId: membership.householdId,
      createdBy: c.get('user').id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    return c.json({ code }, 201);
  })

  .post(
    '/join',
    rateLimit({ windowMs: 60_000, max: 10 }),
    zValidator('json', z.object({ code: z.string().trim().toUpperCase().length(8) })),
    async (c) => {
      const userId = c.get('user').id;
      if (await membershipOf(userId)) {
        return c.json({ error: 'already_in_household' }, 409);
      }
      const { code } = c.req.valid('json');

      const joined = await db.transaction(async (tx) => {
        const invites = await tx
          .select()
          .from(householdInvites)
          .where(and(eq(householdInvites.code, code), isNull(householdInvites.usedBy)))
          .for('update')
          .limit(1);
        const invite = invites[0];
        if (!invite || invite.expiresAt.getTime() < Date.now()) return null;

        await tx
          .update(householdInvites)
          .set({ usedBy: userId })
          .where(eq(householdInvites.code, code));
        await tx
          .insert(householdMembers)
          .values({ householdId: invite.householdId, userId, role: 'member' });
        return invite.householdId;
      });

      if (!joined) {
        return c.json({ error: 'invalid_invite' }, 404);
      }
      const membership = await membershipOf(userId);
      return c.json({ membership }, 201);
    },
  );
