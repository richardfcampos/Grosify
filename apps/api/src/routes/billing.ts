import { zValidator } from '@hono/zod-validator';
import { PLAN_PRICES } from '@grosify/shared';
import { and, desc, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { redeemCoupon } from '../billing/coupons.js';
import { getBillingProvider } from '../billing/index.js';
import type { BillingCycle } from '../billing/types.js';
import { db } from '../db/index.js';
import { households, subscriptions } from '../db/schema.js';
import { requireHousehold, type HouseholdEnv } from '../middleware/household.js';
import { rateLimit } from '../middleware/rate-limit.js';

/** Só owner/admin assinam ou cancelam — papéis já existentes no household. */
function canManageBilling(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

/** Checkout abandonado vira lixo após 24h — aí um novo checkout pode recriar. */
const PENDING_STALE_MS = 24 * 60 * 60 * 1000;

/** Preço da moeda/ciclo; null se a moeda não tem preço configurado (→ 501). */
function priceFor(currency: string, cycle: BillingCycle): number | null {
  const table = (PLAN_PRICES as Record<string, Record<string, number>>)[currency];
  const cents = table?.[cycle];
  return typeof cents === 'number' ? cents : null;
}

const checkoutBody = z.object({
  cycle: z.enum(['monthly', 'yearly']),
  // CPF/CNPJ é exigido pela API BR; vai direto pro provider, nunca persistido (LGPD).
  cpfCnpj: z.string().trim().min(11).max(18),
});

const redeemBody = z.object({
  // Normalização (trim + UPPERCASE) acontece no redeemCoupon; aqui só garante não-vazio.
  code: z.string().trim().min(1).max(64),
});

export const billingRoute = new Hono<HouseholdEnv>()
  .use(requireHousehold)

  .post('/checkout', zValidator('json', checkoutBody), async (c) => {
    const role = c.get('role');
    if (!canManageBilling(role)) return c.json({ error: 'forbidden' }, 403);

    const hid = c.get('householdId');
    const { cycle, cpfCnpj } = c.req.valid('json');

    // Moeda é do household da sessão — nunca do body.
    const [house] = await db
      .select({ currency: households.currency })
      .from(households)
      .where(eq(households.id, hid))
      .limit(1);
    const currency = house?.currency ?? 'BRL';

    const provider = getBillingProvider(currency);
    if (!provider) return c.json({ error: 'provider_unavailable' }, 501);

    const priceCents = priceFor(currency, cycle);
    // Sem preço configurado pra moeda = mesma UX de provider indisponível.
    if (priceCents == null) return c.json({ error: 'provider_unavailable' }, 501);

    // Uma assinatura não-terminal por casa. Se existir e for pending antiga (checkout
    // abandonado), cancela e segue; senão bloqueia (409).
    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.householdId, hid), ne(subscriptions.status, 'canceled')))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (existing) {
      const isStalePending =
        existing.status === 'pending' &&
        Date.now() - existing.createdAt.getTime() > PENDING_STALE_MS;
      if (!isStalePending) return c.json({ error: 'already_subscribed' }, 409);
      // Cancela a pending abandonada no provider (best-effort) e libera o slot.
      if (existing.externalId) {
        try {
          await provider.cancelSubscription(existing.externalId);
        } catch (err) {
          console.error('[billing:checkout] falha ao cancelar pending abandonada', err);
        }
      }
      await db
        .update(subscriptions)
        .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
        .where(eq(subscriptions.id, existing.id));
    }

    // Cria a linha pending ANTES de chamar o provider — a correlação por externalId
    // depende de a linha existir quando o webhook chegar.
    const subId = uuidv7();
    await db.insert(subscriptions).values({
      id: subId,
      householdId: hid,
      provider: provider.name,
      status: 'pending',
      cycle,
      currency,
      priceCents,
    });

    const user = c.get('user');
    try {
      const result = await provider.createSubscription({
        householdId: hid,
        cycle,
        currency,
        priceCents,
        customer: { name: user.name, email: user.email, cpfCnpj },
      });
      await db
        .update(subscriptions)
        .set({
          externalId: result.externalId,
          externalCustomerId: result.externalCustomerId,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, subId));
      return c.json({ checkoutUrl: result.checkoutUrl });
    } catch (err) {
      // Stub sem credencial → 501; provider fora do ar → 502. A linha pending vira
      // canceled pra não travar o slot único (senão o próximo checkout bateria em 409).
      const message = err instanceof Error ? err.message : '';
      await db
        .update(subscriptions)
        .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
        .where(eq(subscriptions.id, subId));
      if (message.includes('provider_unavailable')) {
        return c.json({ error: 'provider_unavailable' }, 501);
      }
      console.error('[billing:checkout] erro do provider', err);
      return c.json({ error: 'provider_error' }, 502);
    }
  })

  .get('/subscription', async (c) => {
    const hid = c.get('householdId');
    // Preferência: a não-terminal mais recente; senão a canceled mais recente; senão null.
    const [active] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.householdId, hid), ne(subscriptions.status, 'canceled')))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    const sub =
      active ??
      (
        await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.householdId, hid))
          .orderBy(desc(subscriptions.createdAt))
          .limit(1)
      )[0];

    if (!sub) return c.json({ subscription: null });
    return c.json({
      subscription: {
        status: sub.status,
        cycle: sub.cycle,
        currency: sub.currency,
        priceCents: sub.priceCents,
        nextDueDate: sub.nextDueDate,
        provider: sub.provider,
      },
    });
  })

  .post('/cancel', async (c) => {
    const role = c.get('role');
    if (!canManageBilling(role)) return c.json({ error: 'forbidden' }, 403);

    const hid = c.get('householdId');
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.householdId, hid), ne(subscriptions.status, 'canceled')))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (!sub) return c.json({ error: 'no_subscription' }, 404);

    if (sub.externalId) {
      const provider = getBillingProvider(sub.currency);
      // Best-effort: se o provider falhar, cancela local mesmo assim (o webhook de
      // SUBSCRIPTION_DELETED, se vier, é no-op numa linha já canceled).
      if (provider) {
        try {
          await provider.cancelSubscription(sub.externalId);
        } catch (err) {
          console.error('[billing:cancel] falha ao cancelar no provider', err);
        }
      }
    }

    const now = new Date();
    // Pro permanece até o fim do período pago (nextDueDate); o lazy expiry em
    // resolveEffectivePlan faz o flip pra free quando o período vence. Não flipa aqui.
    await db
      .update(subscriptions)
      .set({
        status: 'canceled',
        canceledAt: now,
        currentPeriodEnd: sub.nextDueDate ?? now,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, sub.id));

    return c.json({ ok: true });
  })

  // Resgate de cupom de meses grátis de Pro (comp por código, sem gateway). Rate limit
  // barra brute-force de códigos ANTES do gate de negócio. Só owner/admin resgatam.
  .post('/redeem-coupon', rateLimit({ windowMs: 60_000, max: 5 }), zValidator('json', redeemBody), async (c) => {
    const role = c.get('role');
    if (!canManageBilling(role)) return c.json({ error: 'forbidden' }, 403);

    const hid = c.get('householdId');
    const { code } = c.req.valid('json');

    const result = await redeemCoupon(hid, code);
    switch (result.kind) {
      case 'redeemed':
        return c.json({ proUntil: result.proUntil.toISOString() });
      case 'invalid':
        return c.json({ error: 'coupon_invalid' }, 404);
      case 'exhausted':
        return c.json({ error: 'coupon_exhausted' }, 410);
      case 'expired':
        return c.json({ error: 'coupon_expired' }, 410);
      case 'already_redeemed':
        return c.json({ error: 'coupon_already_redeemed' }, 409);
    }
  });
