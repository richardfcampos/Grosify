import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';
import type { BillingEvent } from '../billing/types.js';

const holder = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock('../db/index.js', () => ({
  get db() {
    return holder.db;
  },
}));

// importa DEPOIS do mock — a lib usa o banco de teste
const { applyBillingEvent, resolveEffectivePlan } = await import('../billing/lifecycle.js');

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
    `TRUNCATE subscriptions, webhook_events, household_members, households, "user" RESTART IDENTITY CASCADE;`,
  );
});

// ---- helpers ----
async function seedHousehold(plan: 'free' | 'pro' = 'free', planOverride?: 'pro'): Promise<string> {
  const uid = uuidv7();
  await db().insert(schema.user).values({ id: uid, name: 'u', email: `${uid}@x.com` });
  const id = uuidv7();
  await db()
    .insert(schema.households)
    .values({ id, name: 'Casa', createdBy: uid, currency: 'BRL', plan, planOverride: planOverride ?? null });
  return id;
}

async function seedSub(
  householdId: string,
  opts: {
    externalId: string;
    status?: 'pending' | 'active' | 'overdue' | 'canceled';
    currentPeriodEnd?: Date | null;
    overdueSince?: Date | null;
    createdAt?: Date;
  },
): Promise<string> {
  const id = uuidv7();
  await db()
    .insert(schema.subscriptions)
    .values({
      id,
      householdId,
      provider: 'asaas',
      externalId: opts.externalId,
      status: opts.status ?? 'pending',
      cycle: 'monthly',
      currency: 'BRL',
      priceCents: 1290,
      currentPeriodEnd: opts.currentPeriodEnd ?? null,
      overdueSince: opts.overdueSince ?? null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    });
  return id;
}

function evt(type: BillingEvent['type'], externalSubscriptionId: string, eventId = uuidv7()): BillingEvent {
  return { eventId, type, externalSubscriptionId, raw: {} };
}

async function subStatus(id: string) {
  const [r] = await db()
    .select({ status: schema.subscriptions.status, overdueSince: schema.subscriptions.overdueSince, canceledAt: schema.subscriptions.canceledAt })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, id));
  return r!;
}
async function housePlan(id: string) {
  const [r] = await db().select({ plan: schema.households.plan }).from(schema.households).where(eq(schema.households.id, id));
  return r!.plan;
}

describe('applyBillingEvent — máquina de estados', () => {
  it('payment_confirmed: pending→active e household vira pro', async () => {
    const h = await seedHousehold('free');
    const s = await seedSub(h, { externalId: 'sub_1', status: 'pending' });

    const res = await applyBillingEvent(evt('payment_confirmed', 'sub_1'), 'asaas');

    expect(res).toBe('applied');
    expect((await subStatus(s)).status).toBe('active');
    expect(await housePlan(h)).toBe('pro');
  });

  it('payment_overdue: active→overdue mantendo pro, seta overdueSince', async () => {
    const h = await seedHousehold('pro');
    const s = await seedSub(h, { externalId: 'sub_1', status: 'active' });

    const res = await applyBillingEvent(evt('payment_overdue', 'sub_1'), 'asaas');

    expect(res).toBe('applied');
    const st = await subStatus(s);
    expect(st.status).toBe('overdue');
    expect(st.overdueSince).not.toBeNull();
    expect(await housePlan(h)).toBe('pro'); // grace: mantém pro
  });

  it('payment_confirmed: overdue→active limpa overdueSince e volta pro', async () => {
    const h = await seedHousehold('pro');
    const s = await seedSub(h, { externalId: 'sub_1', status: 'overdue', overdueSince: new Date() });

    const res = await applyBillingEvent(evt('payment_confirmed', 'sub_1'), 'asaas');

    expect(res).toBe('applied');
    const st = await subStatus(s);
    expect(st.status).toBe('active');
    expect(st.overdueSince).toBeNull();
    expect(await housePlan(h)).toBe('pro');
  });

  it('subscription_deleted: active→canceled e plan volta free quando sem período pago', async () => {
    const h = await seedHousehold('pro');
    const s = await seedSub(h, { externalId: 'sub_1', status: 'active' });

    const res = await applyBillingEvent(evt('subscription_deleted', 'sub_1'), 'asaas');

    expect(res).toBe('applied');
    const st = await subStatus(s);
    expect(st.status).toBe('canceled');
    expect(st.canceledAt).not.toBeNull();
    expect(await housePlan(h)).toBe('free');
  });

  it('cancel mantém pro até o fim do período pago (currentPeriodEnd futuro)', async () => {
    const h = await seedHousehold('pro');
    await seedSub(h, {
      externalId: 'sub_1',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 5 * DAY_MS),
    });

    await applyBillingEvent(evt('subscription_deleted', 'sub_1'), 'asaas');

    expect(await housePlan(h)).toBe('pro'); // período pago ainda vigente
  });

  it('payment_refunded: active→canceled', async () => {
    const h = await seedHousehold('pro');
    const s = await seedSub(h, { externalId: 'sub_1', status: 'active' });
    await applyBillingEvent(evt('payment_refunded', 'sub_1'), 'asaas');
    expect((await subStatus(s)).status).toBe('canceled');
  });

  it('chargeback: active→canceled', async () => {
    const h = await seedHousehold('pro');
    const s = await seedSub(h, { externalId: 'sub_1', status: 'active' });
    await applyBillingEvent(evt('chargeback', 'sub_1'), 'asaas');
    expect((await subStatus(s)).status).toBe('canceled');
  });

  it('evento duplicado (mesmo eventId) é no-op', async () => {
    const h = await seedHousehold('free');
    const s = await seedSub(h, { externalId: 'sub_1', status: 'pending' });
    const e = evt('payment_confirmed', 'sub_1', 'evt_dup');

    expect(await applyBillingEvent(e, 'asaas')).toBe('applied');
    expect(await applyBillingEvent(e, 'asaas')).toBe('duplicate');
    expect((await subStatus(s)).status).toBe('active');
  });

  it('assinatura desconhecida (externalId sem linha) → unknown_subscription sem efeito', async () => {
    const h = await seedHousehold('free');
    const res = await applyBillingEvent(evt('payment_confirmed', 'sub_inexistente'), 'asaas');
    expect(res).toBe('unknown_subscription');
    expect(await housePlan(h)).toBe('free');
  });

  it('out-of-order: confirmed depois de canceled é ignorado e plan não volta pra pro', async () => {
    const h = await seedHousehold('free');
    const s = await seedSub(h, { externalId: 'sub_1', status: 'canceled' });

    const res = await applyBillingEvent(evt('payment_confirmed', 'sub_1'), 'asaas');

    expect(res).toBe('ignored_terminal');
    expect((await subStatus(s)).status).toBe('canceled');
    expect(await housePlan(h)).toBe('free');
  });

  it('transição inválida (overdue em pending) → ignored_invalid_transition sem efeito', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = await seedHousehold('free');
    const s = await seedSub(h, { externalId: 'sub_1', status: 'pending' });

    const res = await applyBillingEvent(evt('payment_overdue', 'sub_1'), 'asaas');

    expect(res).toBe('ignored_invalid_transition');
    expect((await subStatus(s)).status).toBe('pending');
  });
});

describe('resolveEffectivePlan — lazy expiry + override', () => {
  it('overdue há 8 dias → flip pra free (write-behind)', async () => {
    const h = await seedHousehold('pro');
    await seedSub(h, {
      externalId: 'sub_1',
      status: 'overdue',
      overdueSince: new Date(Date.now() - 8 * DAY_MS),
    });

    expect(await resolveEffectivePlan(h)).toBe('free');
    expect(await housePlan(h)).toBe('free'); // persistiu a correção
  });

  it('overdue há 2 dias → mantém pro (dentro do grace)', async () => {
    const h = await seedHousehold('pro');
    await seedSub(h, {
      externalId: 'sub_1',
      status: 'overdue',
      overdueSince: new Date(Date.now() - 2 * DAY_MS),
    });

    expect(await resolveEffectivePlan(h)).toBe('pro');
  });

  it('canceled com currentPeriodEnd vencido → free', async () => {
    const h = await seedHousehold('pro');
    await seedSub(h, {
      externalId: 'sub_1',
      status: 'canceled',
      currentPeriodEnd: new Date(Date.now() - 1 * DAY_MS),
    });

    expect(await resolveEffectivePlan(h)).toBe('free');
  });

  it('canceled com currentPeriodEnd futuro → pro (Pro até o fim do pago)', async () => {
    const h = await seedHousehold('pro');
    await seedSub(h, {
      externalId: 'sub_1',
      status: 'canceled',
      currentPeriodEnd: new Date(Date.now() + 3 * DAY_MS),
    });

    expect(await resolveEffectivePlan(h)).toBe('pro');
  });

  it('planOverride=pro vence assinatura canceled expirada → pro', async () => {
    const h = await seedHousehold('free', 'pro');
    await seedSub(h, {
      externalId: 'sub_1',
      status: 'canceled',
      currentPeriodEnd: new Date(Date.now() - 10 * DAY_MS),
    });

    expect(await resolveEffectivePlan(h)).toBe('pro');
  });
});
