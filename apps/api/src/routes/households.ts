import { zValidator } from '@hono/zod-validator';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { db } from '../db/index.js';
import { householdInvites, householdMembers, households } from '../db/schema.js';
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
    return c.json({ membership });
  })

  .post(
    '/',
    zValidator('json', z.object({ name: z.string().trim().min(1).max(100) })),
    async (c) => {
      const userId = c.get('user').id;
      if (await membershipOf(userId)) {
        return c.json({ error: 'você já faz parte de uma casa' }, 409);
      }
      const { name } = c.req.valid('json');
      const id = uuidv7();
      await db.transaction(async (tx) => {
        await tx.insert(households).values({ id, name, createdBy: userId });
        await tx.insert(householdMembers).values({ householdId: id, userId, role: 'owner' });
      });
      return c.json({ household: { id, name, plan: 'free' as const, role: 'owner' as const } }, 201);
    },
  )

  .post('/invites', rateLimit({ windowMs: 60_000, max: 5 }), async (c) => {
    const membership = await membershipOf(c.get('user').id);
    if (!membership) {
      return c.json({ error: 'você ainda não tem uma casa' }, 403);
    }
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
        return c.json({ error: 'você já faz parte de uma casa' }, 409);
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
        return c.json({ error: 'convite inválido ou expirado' }, 404);
      }
      const membership = await membershipOf(userId);
      return c.json({ membership }, 201);
    },
  );
