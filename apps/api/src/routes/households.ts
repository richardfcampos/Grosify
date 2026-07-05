import { zValidator } from '@hono/zod-validator';
import { isValidCurrency, updateMemberPayload } from '@grosify/shared';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { db } from '../db/index.js';
import { activities, householdInvites, householdMembers, households, user } from '../db/schema.js';
import { resolveActiveHouseholdId, setActiveHousehold } from '../lib/active-household.js';
import { renderInviteEmail, resolveLocale, sendEmail } from '../email/index.js';
import { logActivity } from '../lib/activity.js';
import { isSuppressed } from '../lib/email-suppression.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { requireSession, type AuthEnv } from '../middleware/session.js';
import { webBaseUrl } from '../origins.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Código legível sem ambiguidade (sem 0/O, 1/I/L). */
function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  let code = '';
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

/** Membership da casa ATIVA do usuário (multi-casa). */
async function membershipOf(userId: string) {
  const activeId = await resolveActiveHouseholdId(userId);
  if (!activeId) return null;
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
      locale: user.uiLocale,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .innerJoin(user, eq(user.id, householdMembers.userId))
    .where(and(eq(householdMembers.userId, userId), eq(householdMembers.householdId, activeId)))
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

  // Todas as casas do usuário (multi-casa) + qual é a ativa — pro seletor de casa.
  .get('/list', async (c) => {
    const userId = c.get('user').id;
    const activeId = await resolveActiveHouseholdId(userId);
    const rows = await db
      .select({
        householdId: householdMembers.householdId,
        name: households.name,
        role: householdMembers.role,
        plan: households.plan,
      })
      .from(householdMembers)
      .innerJoin(households, eq(households.id, householdMembers.householdId))
      .where(eq(householdMembers.userId, userId))
      .orderBy(asc(householdMembers.joinedAt));
    return c.json({ households: rows, activeHouseholdId: activeId });
  })

  // Troca a casa ativa (valida que é membro). household_id vem do body aqui de propósito —
  // é a única rota cujo papel é justamente escolher a casa; a troca é validada no servidor.
  .post('/switch', zValidator('json', z.object({ householdId: z.string().uuid() })), async (c) => {
    const ok = await setActiveHousehold(c.get('user').id, c.req.valid('json').householdId);
    if (!ok) return c.json({ error: 'not_member' }, 403);
    return c.json({ ok: true });
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

  // Preferências do membro: tema (por casa) + idioma (por conta — segue a pessoa em
  // qualquer aparelho/casa). Persiste na conta pra sincronizar entre aparelhos.
  .post(
    '/settings',
    zValidator(
      'json',
      z.object({
        themeMode: z.enum(['light', 'dark', 'system']).optional(),
        themeDir: z.enum(['painel', 'mercado', 'recibo']).optional(),
        locale: z.enum(['pt', 'en', 'es', 'it', 'de', 'fr']).optional(),
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
      // idioma vive no user (preferência da pessoa, não da casa)
      if (body.locale !== undefined) {
        await db
          .update(user)
          .set({ uiLocale: body.locale })
          .where(eq(user.id, c.get('user').id));
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
      // multi-casa: criar uma casa nova é permitido mesmo já tendo outra.
      const { name, currency } = c.req.valid('json');
      const id = uuidv7();
      await db.transaction(async (tx) => {
        await tx.insert(households).values({ id, name, currency, createdBy: userId });
        await tx.insert(householdMembers).values({ householdId: id, userId, role: 'owner' });
        // a casa recém-criada vira a ativa
        await tx.update(user).set({ activeHouseholdId: id }).where(eq(user.id, userId));
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
    // só quem verificou o e-mail pode convidar (corta abuso de conta não-verificada)
    if (!c.get('user').emailVerified) return c.json({ error: 'email_not_verified' }, 403);
    const code = inviteCode();
    await db.insert(householdInvites).values({
      code,
      householdId: membership.householdId,
      createdBy: c.get('user').id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    return c.json({ code }, 201);
  })

  // Convite por e-mail: token opaco amarrado ao endereço + e-mail com o link.
  // Mantém o código humano (share manual, confiança menor); o token é o caminho seguro.
  .post(
    '/invites/email',
    rateLimit({ windowMs: 60_000, max: 5 }),
    zValidator('json', z.object({ email: z.string().trim().toLowerCase().email() })),
    async (c) => {
      const membership = await membershipOf(c.get('user').id);
      if (!membership) return c.json({ error: 'no_household' }, 403);
      if (membership.role !== 'owner' && membership.role !== 'admin')
        return c.json({ error: 'forbidden' }, 403);
      if (!c.get('user').emailVerified) return c.json({ error: 'email_not_verified' }, 403);
      const { email } = c.req.valid('json');
      // não convidar e-mail que já deu bounce/reclamação (protege reputação de envio)
      if (await isSuppressed(email)) return c.json({ error: 'email_suppressed' }, 422);
      const code = inviteCode();
      const token = randomBytes(32).toString('base64url');
      await db.insert(householdInvites).values({
        code,
        token,
        invitedEmail: email,
        householdId: membership.householdId,
        createdBy: c.get('user').id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });
      const url = `${webBaseUrl}/convite/${token}`;
      const { subject, html, text } = renderInviteEmail(resolveLocale(c.req.raw), {
        inviterName: c.get('user').name,
        householdName: membership.name,
        url,
      });
      await sendEmail({ to: email, subject, html, text });
      return c.json({ ok: true }, 201);
    },
  )

  // Pré-visualização do convite (landing acolhedora) — quem convidou + nome da casa.
  // `value` é o token (>8 chars) ou o código humano (8). Exige sessão (já no middleware).
  .get('/invites/:value', async (c) => {
    const value = c.req.param('value');
    const byToken = value.length > 8;
    const rows = await db
      .select({
        householdName: households.name,
        invitedByName: user.name,
        invitedEmail: householdInvites.invitedEmail,
        expiresAt: householdInvites.expiresAt,
        usedBy: householdInvites.usedBy,
      })
      .from(householdInvites)
      .innerJoin(households, eq(households.id, householdInvites.householdId))
      .innerJoin(user, eq(user.id, householdInvites.createdBy))
      .where(
        byToken
          ? eq(householdInvites.token, value)
          : eq(householdInvites.code, value.toUpperCase()),
      )
      .limit(1);
    const inv = rows[0];
    if (!inv || inv.usedBy || inv.expiresAt.getTime() < Date.now()) {
      return c.json({ error: 'invalid_invite' }, 404);
    }
    return c.json({
      householdName: inv.householdName,
      invitedByName: inv.invitedByName,
      requiresEmail: inv.invitedEmail != null,
      emailMatches: inv.invitedEmail == null || inv.invitedEmail === c.get('user').email,
    });
  })

  .post(
    '/join',
    rateLimit({ windowMs: 60_000, max: 10 }),
    zValidator(
      'json',
      z
        .object({
          code: z.string().trim().toUpperCase().length(8).optional(),
          token: z.string().trim().optional(),
        })
        .refine((v) => Boolean(v.code) || Boolean(v.token), { message: 'missing_invite' }),
    ),
    async (c) => {
      const userId = c.get('user').id;
      const userEmail = c.get('user').email;
      const { code, token } = c.req.valid('json');

      const result = await db.transaction(async (tx) => {
        const invites = await tx
          .select()
          .from(householdInvites)
          .where(
            and(
              token ? eq(householdInvites.token, token) : eq(householdInvites.code, code!),
              isNull(householdInvites.usedBy),
            ),
          )
          .for('update')
          .limit(1);
        const invite = invites[0];
        if (!invite || invite.expiresAt.getTime() < Date.now()) return { kind: 'invalid' as const };
        // E7: convite por e-mail só vale pro endereço convidado
        if (invite.invitedEmail && invite.invitedEmail !== userEmail) {
          return { kind: 'mismatch' as const };
        }
        // multi-casa: pode ter outras casas, mas não entra duas vezes na MESMA
        const existing = await tx
          .select({ hid: householdMembers.householdId })
          .from(householdMembers)
          .where(
            and(
              eq(householdMembers.userId, userId),
              eq(householdMembers.householdId, invite.householdId),
            ),
          )
          .limit(1);
        if (existing[0]) return { kind: 'already' as const };

        await tx
          .update(householdInvites)
          .set({ usedBy: userId })
          .where(eq(householdInvites.code, invite.code));
        await tx
          .insert(householdMembers)
          .values({ householdId: invite.householdId, userId, role: 'member' });
        // a casa em que acabou de entrar vira a ativa
        await tx.update(user).set({ activeHouseholdId: invite.householdId }).where(eq(user.id, userId));
        return { kind: 'ok' as const };
      });

      if (result.kind === 'mismatch') return c.json({ error: 'invite_email_mismatch' }, 403);
      if (result.kind === 'already') return c.json({ error: 'already_in_household' }, 409);
      if (result.kind !== 'ok') return c.json({ error: 'invalid_invite' }, 404);

      const membership = await membershipOf(userId);
      return c.json({ membership }, 201);
    },
  );
