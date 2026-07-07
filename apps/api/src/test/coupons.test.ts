import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';

const holder = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock('../db/index.js', () => ({
  get db() {
    return holder.db;
  },
}));

// importa DEPOIS do mock — as libs usam o banco de teste
const { redeemCoupon } = await import('../billing/coupons.js');
const { resolveEffectivePlan } = await import('../billing/lifecycle.js');

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
});

// ---- helpers ----
async function seedHousehold(plan: 'free' | 'pro' = 'free'): Promise<string> {
  const uid = uuidv7();
  await db().insert(schema.user).values({ id: uid, name: 'u', email: `${uid}@x.com` });
  const id = uuidv7();
  await db().insert(schema.households).values({ id, name: 'Casa', createdBy: uid, currency: 'BRL', plan });
  return id;
}

async function seedCoupon(opts: {
  code: string;
  months: number;
  maxRedemptions?: number | null;
  redeemedCount?: number;
  expiresAt?: Date | null;
}): Promise<string> {
  const id = uuidv7();
  await db()
    .insert(schema.coupons)
    .values({
      id,
      code: opts.code.toUpperCase(),
      months: opts.months,
      maxRedemptions: opts.maxRedemptions ?? null,
      redeemedCount: opts.redeemedCount ?? 0,
      expiresAt: opts.expiresAt ?? null,
    });
  return id;
}

async function house(id: string) {
  const [r] = await db()
    .select({
      plan: schema.households.plan,
      planOverride: schema.households.planOverride,
      planOverrideUntil: schema.households.planOverrideUntil,
    })
    .from(schema.households)
    .where(eq(schema.households.id, id));
  return r!;
}

async function couponById(id: string) {
  const [r] = await db()
    .select({ redeemedCount: schema.coupons.redeemedCount })
    .from(schema.coupons)
    .where(eq(schema.coupons.id, id));
  return r!;
}

async function redemptionCount(couponId: string) {
  const rows = await db()
    .select({ id: schema.couponRedemptions.id })
    .from(schema.couponRedemptions)
    .where(eq(schema.couponRedemptions.couponId, couponId));
  return rows.length;
}

describe('redeemCoupon — resgate', () => {
  it('cupom válido: casa vira pro por N meses (planOverrideUntil), retorna proUntil (CUP-1.5)', async () => {
    const h = await seedHousehold('free');
    const cid = await seedCoupon({ code: 'welcome3', months: 3 });

    const before = Date.now();
    const res = await redeemCoupon(h, 'welcome3');
    expect(res.kind).toBe('redeemed');
    if (res.kind !== 'redeemed') throw new Error('unreachable');

    const hs = await house(h);
    expect(hs.planOverride).toBe('pro');
    expect(hs.planOverrideUntil).not.toBeNull();
    // 3 meses no calendário a partir de agora (janela ampla pra não flakar em virada de mês).
    const expected = new Date(before);
    expected.setMonth(expected.getMonth() + 3);
    expect(res.proUntil.getTime()).toBeGreaterThan(before + 80 * DAY_MS);
    expect(Math.abs(res.proUntil.getTime() - expected.getTime())).toBeLessThan(2 * DAY_MS);
    expect((await couponById(cid)).redeemedCount).toBe(1);
    // plan materializado permanece; efetivo resolve pra pro (CUP-1.6)
    expect(hs.plan).toBe('free');
    expect(await resolveEffectivePlan(h)).toBe('pro');
  });

  it('case-insensitive + trim no código (CUP-1.2)', async () => {
    const h = await seedHousehold('free');
    await seedCoupon({ code: 'PROMO6', months: 6 });

    const res = await redeemCoupon(h, '  promo6  ');
    expect(res.kind).toBe('redeemed');
  });

  it('extensão EMPILHA: 2º cupom soma sobre o until vigente (CUP-1.5)', async () => {
    const h = await seedHousehold('free');
    await seedCoupon({ code: 'A2', months: 2 });
    await seedCoupon({ code: 'B3', months: 3 });

    const r1 = await redeemCoupon(h, 'A2');
    if (r1.kind !== 'redeemed') throw new Error('r1');
    const r2 = await redeemCoupon(h, 'B3');
    if (r2.kind !== 'redeemed') throw new Error('r2');

    // 2º empilha sobre o until do 1º → +3 meses sobre o final anterior (≈ 5 meses do agora).
    const expected = addMonths(r1.proUntil, 3);
    expect(Math.abs(r2.proUntil.getTime() - expected.getTime())).toBeLessThan(2 * DAY_MS);
    expect(r2.proUntil.getTime()).toBeGreaterThan(r1.proUntil.getTime());
  });

  it('override expirado não empilha: soma a partir de agora, não do passado', async () => {
    const h = await seedHousehold('free');
    // override vencido há 10 dias
    await db()
      .update(schema.households)
      .set({ planOverride: 'pro', planOverrideUntil: new Date(Date.now() - 10 * DAY_MS) })
      .where(eq(schema.households.id, h));
    await seedCoupon({ code: 'C1', months: 1 });

    const before = Date.now();
    const res = await redeemCoupon(h, 'C1');
    if (res.kind !== 'redeemed') throw new Error('res');
    // parte de agora (futuro), não do until vencido
    expect(res.proUntil.getTime()).toBeGreaterThan(before);
  });

  it('1 resgate por casa: 2ª tentativa do mesmo cupom → already_redeemed, redeemedCount fica 1 (CUP-1.4)', async () => {
    const h = await seedHousehold('free');
    const cid = await seedCoupon({ code: 'ONCE', months: 1 });

    expect((await redeemCoupon(h, 'ONCE')).kind).toBe('redeemed');
    expect((await redeemCoupon(h, 'ONCE')).kind).toBe('already_redeemed');
    expect((await couponById(cid)).redeemedCount).toBe(1);
    expect(await redemptionCount(cid)).toBe(1);
  });

  it('cupom inexistente → invalid (CUP-1.3)', async () => {
    const h = await seedHousehold('free');
    expect((await redeemCoupon(h, 'NOPE')).kind).toBe('invalid');
  });

  it('cupom esgotado (redeemedCount >= maxRedemptions) → exhausted', async () => {
    const h = await seedHousehold('free');
    await seedCoupon({ code: 'FULL', months: 1, maxRedemptions: 5, redeemedCount: 5 });
    expect((await redeemCoupon(h, 'FULL')).kind).toBe('exhausted');
  });

  it('cupom expirado (expiresAt passado) → expired', async () => {
    const h = await seedHousehold('free');
    await seedCoupon({ code: 'OLD', months: 1, expiresAt: new Date(Date.now() - DAY_MS) });
    expect((await redeemCoupon(h, 'OLD')).kind).toBe('expired');
  });

  it('maxRedemptions null = ilimitado: resgata mesmo com resgates anteriores', async () => {
    const h1 = await seedHousehold('free');
    const h2 = await seedHousehold('free');
    await seedCoupon({ code: 'UNLIMITED', months: 1, maxRedemptions: null });
    expect((await redeemCoupon(h1, 'UNLIMITED')).kind).toBe('redeemed');
    expect((await redeemCoupon(h2, 'UNLIMITED')).kind).toBe('redeemed');
  });

  it('esgota exatamente no teto: casa diferente após atingir max → exhausted', async () => {
    const h1 = await seedHousehold('free');
    const h2 = await seedHousehold('free');
    await seedCoupon({ code: 'CAP1', months: 1, maxRedemptions: 1 });
    expect((await redeemCoupon(h1, 'CAP1')).kind).toBe('redeemed');
    expect((await redeemCoupon(h2, 'CAP1')).kind).toBe('exhausted');
  });
});

describe('resolveEffectivePlan — validade do override', () => {
  it('override com until futuro → pro (CUP-2.1)', async () => {
    const h = await seedHousehold('free');
    await db()
      .update(schema.households)
      .set({ planOverride: 'pro', planOverrideUntil: new Date(Date.now() + 30 * DAY_MS) })
      .where(eq(schema.households.id, h));
    expect(await resolveEffectivePlan(h)).toBe('pro');
  });

  it('override com until passado → segue assinatura (free), sem limpar o override (CUP-2.2)', async () => {
    const h = await seedHousehold('free');
    await db()
      .update(schema.households)
      .set({ planOverride: 'pro', planOverrideUntil: new Date(Date.now() - DAY_MS) })
      .where(eq(schema.households.id, h));

    expect(await resolveEffectivePlan(h)).toBe('free');
    // NÃO limpa o override — mantém histórico do que foi concedido
    const hs = await house(h);
    expect(hs.planOverride).toBe('pro');
    expect(hs.planOverrideUntil).not.toBeNull();
  });

  it('override com until null → pro permanente (comp existente segue funcionando)', async () => {
    const h = await seedHousehold('free');
    await db()
      .update(schema.households)
      .set({ planOverride: 'pro', planOverrideUntil: null })
      .where(eq(schema.households.id, h));
    expect(await resolveEffectivePlan(h)).toBe('pro');
  });
});

/** Espelha o addMonths do coupons.ts pra checar o empilhamento no teste. */
function addMonths(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}
