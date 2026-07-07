import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { desc, eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { Hono } from 'hono';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';
import type { PaymentProvider } from '../billing/types.js';

// Banco real (Postgres em WASM) no lugar do db/index.
const holder = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock('../db/index.js', () => ({
  get db() {
    return holder.db;
  },
}));

// Sessão controlável por teste — requireHousehold usa auth.api.getSession.
const sessionHolder = vi.hoisted(() => ({
  user: null as null | { id: string; name: string; email: string; emailVerified: boolean },
}));
vi.mock('../auth.js', () => ({
  auth: {
    api: {
      getSession: async () =>
        sessionHolder.user
          ? { user: sessionHolder.user, session: { id: 's', userId: sessionHolder.user.id } }
          : null,
    },
  },
}));

// importa DEPOIS dos mocks
const { billingRoute } = await import('../routes/billing.js');
const { setBillingProvider, resetBillingProviders } = await import('../billing/index.js');
const { applyBillingEvent, resolveEffectivePlan } = await import('../billing/lifecycle.js');

const app = new Hono().route('/billing', billingRoute);

let pg: PGlite;
const db = () => holder.db;
const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  pg = new PGlite();
  holder.db = drizzle(pg, { schema });
  const dir = './drizzle';
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    await pg.exec(readFileSync(join(dir, f), 'utf8'));
  }
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(
    `TRUNCATE coupon_redemptions, coupons, subscriptions, webhook_events, household_members, households, "user" RESTART IDENTITY CASCADE;`,
  );
  sessionHolder.user = null;
});

afterEach(() => {
  resetBillingProviders();
  vi.restoreAllMocks();
});

// ---- helpers ----
async function seed(role: 'owner' | 'admin' | 'member' | 'viewer', currency = 'BRL') {
  const uid = uuidv7();
  await db()
    .insert(schema.user)
    .values({ id: uid, name: 'Fulano', email: `${uid}@x.com`, emailVerified: true });
  const hid = uuidv7();
  await db().insert(schema.households).values({ id: hid, name: 'Casa', createdBy: uid, currency });
  await db().insert(schema.householdMembers).values({ householdId: hid, userId: uid, role });
  await db().update(schema.user).set({ activeHouseholdId: hid }).where(eq(schema.user.id, uid));
  sessionHolder.user = { id: uid, name: 'Fulano', email: `${uid}@x.com`, emailVerified: true };
  return { uid, hid };
}

/** Provider fake com URL de checkout controlável e comportamento de erro injetável. */
function fakeProvider(over: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    name: 'asaas',
    createSubscription: vi.fn(async () => ({
      externalId: 'sub_ext_1',
      externalCustomerId: 'cus_1',
      checkoutUrl: 'https://asaas.test/i/abc',
    })),
    cancelSubscription: vi.fn(async () => {}),
    verifyAndParseWebhook: vi.fn(async () => null),
    ...over,
  };
}

function post(path: string, body: unknown, ip?: string) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // IP distinto isola o bucket do rate limit por teste (chave = ip:path). O limite
      // continua real: várias chamadas do MESMO ip ainda batem no 429.
      ...(ip ? { 'x-forwarded-for': ip } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function latestSub(hid: string) {
  const [s] = await db()
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.householdId, hid))
    .orderBy(desc(schema.subscriptions.createdAt))
    .limit(1);
  return s!;
}
async function housePlan(hid: string) {
  const [h] = await db()
    .select({ plan: schema.households.plan })
    .from(schema.households)
    .where(eq(schema.households.id, hid));
  return h!.plan;
}
/** Plano efetivo (materializado + override) — o resgate de cupom age via override. */
async function housePlanEffective(hid: string) {
  return resolveEffectivePlan(hid);
}

describe('POST /billing/checkout', () => {
  it('owner: cria linha pending e retorna checkoutUrl (BILL-02 AC1)', async () => {
    const { hid } = await seed('owner');
    setBillingProvider('BRL', fakeProvider());

    const res = await post('/billing/checkout', { cycle: 'monthly', cpfCnpj: '12345678901' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checkoutUrl: 'https://asaas.test/i/abc' });
    const sub = await latestSub(hid);
    expect(sub.status).toBe('pending');
    expect(sub.externalId).toBe('sub_ext_1');
    expect(sub.priceCents).toBe(1290);
    expect(sub.currency).toBe('BRL');
  });

  it('webhook confirma → assinatura active e household vira pro (BILL-02 AC4)', async () => {
    const { hid } = await seed('owner');
    setBillingProvider('BRL', fakeProvider());
    await post('/billing/checkout', { cycle: 'monthly', cpfCnpj: '12345678901' });

    const res = await applyBillingEvent(
      { eventId: 'e1', type: 'payment_confirmed', externalSubscriptionId: 'sub_ext_1', raw: {} },
      'asaas',
    );

    expect(res).toBe('applied');
    expect((await latestSub(hid)).status).toBe('active');
    expect(await housePlan(hid)).toBe('pro');
  });

  it('member → 403 forbidden (BILL-02 AC2)', async () => {
    await seed('member');
    setBillingProvider('BRL', fakeProvider());

    const res = await post('/billing/checkout', { cycle: 'monthly', cpfCnpj: '12345678901' });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('viewer → 403 forbidden (BILL-02 AC2)', async () => {
    await seed('viewer');
    setBillingProvider('BRL', fakeProvider());
    // viewer é barrado pelo middleware (read_only) OU pela rota (forbidden) — ambos 403.
    const res = await post('/billing/checkout', { cycle: 'monthly', cpfCnpj: '12345678901' });
    expect(res.status).toBe(403);
  });

  it('sem provider (env ausente) → 501 provider_unavailable (BILL-02 AC3)', async () => {
    await seed('owner'); // sem setBillingProvider → factory sem env → null

    const res = await post('/billing/checkout', { cycle: 'monthly', cpfCnpj: '12345678901' });

    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: 'provider_unavailable' });
  });

  it('household já com assinatura ativa → 409 already_subscribed (BILL-02 AC7)', async () => {
    const { hid } = await seed('owner');
    setBillingProvider('BRL', fakeProvider());
    await db().insert(schema.subscriptions).values({
      id: uuidv7(),
      householdId: hid,
      provider: 'asaas',
      externalId: 'sub_old',
      status: 'active',
      cycle: 'monthly',
      currency: 'BRL',
      priceCents: 1290,
    });

    const res = await post('/billing/checkout', { cycle: 'monthly', cpfCnpj: '12345678901' });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_subscribed' });
  });

  it('pending abandonada >24h → cancela e recria (edge case)', async () => {
    const { hid } = await seed('owner');
    const cancelSpy = vi.fn(async () => {});
    setBillingProvider('BRL', fakeProvider({ cancelSubscription: cancelSpy }));
    await db().insert(schema.subscriptions).values({
      id: uuidv7(),
      householdId: hid,
      provider: 'asaas',
      externalId: 'sub_stale',
      status: 'pending',
      cycle: 'monthly',
      currency: 'BRL',
      priceCents: 1290,
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    const res = await post('/billing/checkout', { cycle: 'monthly', cpfCnpj: '12345678901' });

    expect(res.status).toBe(200);
    expect(cancelSpy).toHaveBeenCalledWith('sub_stale');
    // a antiga virou canceled e a nova pending existe
    const rows = await db()
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.householdId, hid));
    const stale = rows.find((r) => r.externalId === 'sub_stale');
    expect(stale?.status).toBe('canceled');
    const fresh = rows.find((r) => r.externalId === 'sub_ext_1');
    expect(fresh?.status).toBe('pending');
  });

  it('provider fora do ar → 502 provider_error e linha vira canceled (edge case)', async () => {
    const { hid } = await seed('owner');
    setBillingProvider(
      'BRL',
      fakeProvider({
        createSubscription: vi.fn(async () => {
          throw new Error('asaas_503: down');
        }),
      }),
    );

    const res = await post('/billing/checkout', { cycle: 'monthly', cpfCnpj: '12345678901' });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'provider_error' });
    expect((await latestSub(hid)).status).toBe('canceled');
  });

  it('provider lança provider_unavailable → 501 (stub sem credencial)', async () => {
    const { hid } = await seed('owner');
    setBillingProvider(
      'BRL',
      fakeProvider({
        createSubscription: vi.fn(async () => {
          throw new Error('provider_unavailable');
        }),
      }),
    );

    const res = await post('/billing/checkout', { cycle: 'monthly', cpfCnpj: '12345678901' });

    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: 'provider_unavailable' });
    expect((await latestSub(hid)).status).toBe('canceled');
  });
});

describe('GET /billing/subscription (BILL-03 AC1)', () => {
  it('null quando não há assinatura', async () => {
    await seed('owner');
    const res = await app.request('/billing/subscription');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subscription: null });
  });

  it('retorna shape {status,cycle,currency,priceCents,nextDueDate,provider}', async () => {
    const { hid } = await seed('owner');
    const due = new Date(Date.now() + 10 * DAY_MS);
    await db().insert(schema.subscriptions).values({
      id: uuidv7(),
      householdId: hid,
      provider: 'asaas',
      externalId: 'sub_1',
      status: 'active',
      cycle: 'yearly',
      currency: 'BRL',
      priceCents: 9900,
      nextDueDate: due,
    });

    const res = await app.request('/billing/subscription');
    const body = (await res.json()) as { subscription: Record<string, unknown> };
    expect(body.subscription.status).toBe('active');
    expect(body.subscription.cycle).toBe('yearly');
    expect(body.subscription.currency).toBe('BRL');
    expect(body.subscription.priceCents).toBe(9900);
    expect(body.subscription.provider).toBe('asaas');
    expect(body.subscription.nextDueDate).not.toBeNull();
  });

  it('prefere a não-terminal quando há canceled + ativa', async () => {
    const { hid } = await seed('owner');
    await db().insert(schema.subscriptions).values({
      id: uuidv7(),
      householdId: hid,
      provider: 'asaas',
      status: 'canceled',
      cycle: 'monthly',
      currency: 'BRL',
      priceCents: 1290,
      createdAt: new Date(Date.now() - DAY_MS),
    });
    await db().insert(schema.subscriptions).values({
      id: uuidv7(),
      householdId: hid,
      provider: 'asaas',
      status: 'active',
      cycle: 'yearly',
      currency: 'BRL',
      priceCents: 9900,
    });

    const res = await app.request('/billing/subscription');
    const body = (await res.json()) as { subscription: Record<string, unknown> };
    expect(body.subscription.status).toBe('active');
  });
});

describe('POST /billing/cancel (BILL-03 AC2)', () => {
  it('owner cancela: status canceled + currentPeriodEnd = nextDueDate; não flipa plan', async () => {
    const { hid } = await seed('owner');
    const cancelSpy = vi.fn(async () => {});
    setBillingProvider('BRL', fakeProvider({ cancelSubscription: cancelSpy }));
    const due = new Date(Date.now() + 5 * DAY_MS);
    const subId = uuidv7();
    await db().insert(schema.subscriptions).values({
      id: subId,
      householdId: hid,
      provider: 'asaas',
      externalId: 'sub_1',
      status: 'active',
      cycle: 'monthly',
      currency: 'BRL',
      priceCents: 1290,
      nextDueDate: due,
    });
    await db().update(schema.households).set({ plan: 'pro' }).where(eq(schema.households.id, hid));

    const res = await post('/billing/cancel', {});

    expect(res.status).toBe(200);
    expect(cancelSpy).toHaveBeenCalledWith('sub_1');
    const sub = await latestSub(hid);
    expect(sub.status).toBe('canceled');
    expect(sub.canceledAt).not.toBeNull();
    expect(sub.currentPeriodEnd?.getTime()).toBe(due.getTime());
    // não flipa imediatamente — Pro até o fim do período pago (lazy expiry cuida depois)
    expect(await housePlan(hid)).toBe('pro');
  });

  it('sem assinatura não-terminal → 404 no_subscription', async () => {
    await seed('owner');
    const res = await post('/billing/cancel', {});
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_subscription' });
  });

  it('member → 403 forbidden', async () => {
    const { hid } = await seed('member');
    await db().insert(schema.subscriptions).values({
      id: uuidv7(),
      householdId: hid,
      provider: 'asaas',
      status: 'active',
      cycle: 'monthly',
      currency: 'BRL',
      priceCents: 1290,
    });
    const res = await post('/billing/cancel', {});
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });
});

describe('POST /billing/redeem-coupon (CUP-1)', () => {
  async function seedCoupon(opts: {
    code: string;
    months: number;
    maxRedemptions?: number | null;
    redeemedCount?: number;
    expiresAt?: Date | null;
  }) {
    await db()
      .insert(schema.coupons)
      .values({
        id: uuidv7(),
        code: opts.code.toUpperCase(),
        months: opts.months,
        maxRedemptions: opts.maxRedemptions ?? null,
        redeemedCount: opts.redeemedCount ?? 0,
        expiresAt: opts.expiresAt ?? null,
      });
  }

  it('owner resgata cupom válido → 200 {proUntil} e casa vira pro (CUP-1.5)', async () => {
    const { hid } = await seed('owner');
    await seedCoupon({ code: 'WELCOME3', months: 3 });

    const res = await post('/billing/redeem-coupon', { code: 'welcome3' }, '10.0.0.1');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { proUntil: string };
    expect(typeof body.proUntil).toBe('string');
    expect(new Date(body.proUntil).getTime()).toBeGreaterThan(Date.now());
    // efetivo vira pro (membership resolve via override)
    expect(await housePlanEffective(hid)).toBe('pro');
  });

  it('admin também resgata (CUP-1.7)', async () => {
    await seed('admin');
    await seedCoupon({ code: 'ADM', months: 1 });
    const res = await post('/billing/redeem-coupon', { code: 'ADM' }, '10.0.0.2');
    expect(res.status).toBe(200);
  });

  it('código inexistente → 404 coupon_invalid', async () => {
    await seed('owner');
    const res = await post('/billing/redeem-coupon', { code: 'NOPE' }, '10.0.0.3');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'coupon_invalid' });
  });

  it('cupom esgotado → 410 coupon_exhausted', async () => {
    await seed('owner');
    await seedCoupon({ code: 'FULL', months: 1, maxRedemptions: 1, redeemedCount: 1 });
    const res = await post('/billing/redeem-coupon', { code: 'FULL' }, '10.0.0.4');
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'coupon_exhausted' });
  });

  it('cupom expirado → 410 coupon_expired', async () => {
    await seed('owner');
    await seedCoupon({ code: 'OLD', months: 1, expiresAt: new Date(Date.now() - DAY_MS) });
    const res = await post('/billing/redeem-coupon', { code: 'OLD' }, '10.0.0.5');
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'coupon_expired' });
  });

  it('já resgatado pela casa → 409 coupon_already_redeemed (CUP-1.4)', async () => {
    await seed('owner');
    await seedCoupon({ code: 'ONCE', months: 1 });
    expect((await post('/billing/redeem-coupon', { code: 'ONCE' }, '10.0.0.6')).status).toBe(200);
    const res = await post('/billing/redeem-coupon', { code: 'ONCE' }, '10.0.0.6');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'coupon_already_redeemed' });
  });

  it('member → 403 forbidden (CUP-1.7)', async () => {
    await seed('member');
    await seedCoupon({ code: 'ANY', months: 1 });
    const res = await post('/billing/redeem-coupon', { code: 'ANY' }, '10.0.0.7');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('viewer → 403 (read_only pelo middleware)', async () => {
    await seed('viewer');
    await seedCoupon({ code: 'ANY2', months: 1 });
    const res = await post('/billing/redeem-coupon', { code: 'ANY2' }, '10.0.0.8');
    expect(res.status).toBe(403);
  });

  it('rate limit: 6ª chamada do mesmo IP em 1min → 429 (CUP-1.9)', async () => {
    await seed('owner');
    // 5 permitidas (todas coupon_invalid, código inexistente), a 6ª é barrada pelo limiter
    for (let i = 0; i < 5; i++) {
      const r = await post('/billing/redeem-coupon', { code: `X${i}` }, '10.9.9.9');
      expect(r.status).toBe(404);
    }
    const sixth = await post('/billing/redeem-coupon', { code: 'X6' }, '10.9.9.9');
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ error: 'rate_limited' });
  });
});
