import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { desc, eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { Hono } from 'hono';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';

const holder = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock('../db/index.js', () => ({
  get db() {
    return holder.db;
  },
}));

const { webhooksRoute } = await import('../routes/webhooks.js');
const app = new Hono().route('/webhooks', webhooksRoute);

let pg: PGlite;
const db = () => holder.db;
const TOKEN = 'secret-token';

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
  process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;
});

afterEach(() => {
  delete process.env.ASAAS_WEBHOOK_TOKEN;
  vi.restoreAllMocks();
});

// ---- helpers ----
async function seedSub(externalId: string, status: 'pending' | 'active' | 'overdue' = 'pending') {
  const uid = uuidv7();
  await db().insert(schema.user).values({ id: uid, name: 'u', email: `${uid}@x.com` });
  const hid = uuidv7();
  await db()
    .insert(schema.households)
    .values({ id: hid, name: 'Casa', createdBy: uid, currency: 'BRL', plan: 'free' });
  await db().insert(schema.subscriptions).values({
    id: uuidv7(),
    householdId: hid,
    provider: 'asaas',
    externalId,
    status,
    cycle: 'monthly',
    currency: 'BRL',
    priceCents: 1290,
  });
  return hid;
}

function send(body: unknown, token: string | null = TOKEN) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) headers['asaas-access-token'] = token;
  return app.request('/webhooks/asaas', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function housePlan(hid: string) {
  const [h] = await db()
    .select({ plan: schema.households.plan })
    .from(schema.households)
    .where(eq(schema.households.id, hid));
  return h!.plan;
}
async function subStatus(externalId: string) {
  const [s] = await db()
    .select({ status: schema.subscriptions.status })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.externalId, externalId))
    .orderBy(desc(schema.subscriptions.createdAt));
  return s?.status;
}

describe('POST /webhooks/asaas', () => {
  it('token inválido → 401 sem efeito no banco (BILL-02 AC5)', async () => {
    const hid = await seedSub('sub_1', 'pending');

    const res = await send(
      { id: 'evt_1', event: 'PAYMENT_CONFIRMED', payment: { subscription: 'sub_1' } },
      'wrong-token',
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
    // nada mudou
    expect(await subStatus('sub_1')).toBe('pending');
    expect(await housePlan(hid)).toBe('free');
  });

  it('pagamento confirmado → assinatura active e household pro (BILL-02 AC4)', async () => {
    const hid = await seedSub('sub_1', 'pending');

    const res = await send({
      id: 'evt_conf',
      event: 'PAYMENT_CONFIRMED',
      payment: { subscription: 'sub_1' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await subStatus('sub_1')).toBe('active');
    expect(await housePlan(hid)).toBe('pro');
  });

  it('mesmo eventId 2x → segunda é no-op (BILL-02 AC6)', async () => {
    await seedSub('sub_1', 'pending');
    const evt = { id: 'evt_dup', event: 'PAYMENT_CONFIRMED', payment: { subscription: 'sub_1' } };

    expect((await send(evt)).status).toBe(200);
    // segunda entrega do MESMO evento não reaplica — dedupe por (provider, eventId)
    expect((await send(evt)).status).toBe(200);
    const rows = await db()
      .select()
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.eventId, 'evt_dup'));
    expect(rows.length).toBe(1);
  });

  it('assinatura desconhecida → 200 sem efeito', async () => {
    const res = await send({
      id: 'evt_x',
      event: 'PAYMENT_CONFIRMED',
      payment: { subscription: 'sub_inexistente' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('evento não mapeado → 200 sem efeito', async () => {
    await seedSub('sub_1', 'pending');
    const res = await send({
      id: 'evt_ignored',
      event: 'PAYMENT_CREATED',
      payment: { subscription: 'sub_1' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // status inalterado
    expect(await subStatus('sub_1')).toBe('pending');
  });

  it('body inválido (não-JSON) → 400 bad_payload', async () => {
    const res = await send('not json{', TOKEN);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_payload' });
  });
});
