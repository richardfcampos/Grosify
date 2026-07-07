import { createHmac } from 'node:crypto';
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
const SECRET = 'whsec_test_secret';

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
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  vi.restoreAllMocks();
});

// ---- helpers ----
// provider 'stripe' na linha — a correlação do webhook é por (provider, externalId),
// então uma subscription 'asaas' com o mesmo externalId NÃO seria encontrada.
async function seedSub(externalId: string, status: 'pending' | 'active' | 'overdue' = 'pending') {
  const uid = uuidv7();
  await db().insert(schema.user).values({ id: uid, name: 'u', email: `${uid}@x.com` });
  const hid = uuidv7();
  await db()
    .insert(schema.households)
    .values({ id: hid, name: 'Casa', createdBy: uid, currency: 'USD', plan: 'free' });
  await db().insert(schema.subscriptions).values({
    id: uuidv7(),
    householdId: hid,
    provider: 'stripe',
    externalId,
    status,
    cycle: 'monthly',
    currency: 'USD',
    priceCents: 399,
  });
  return hid;
}

/** Assina o payload como o Stripe: header `t=<ts>,v1=<hmac hex>`. */
function sign(payload: string, ts = Math.floor(Date.now() / 1000)): string {
  const hmac = createHmac('sha256', SECRET).update(`${ts}.${payload}`).digest('hex');
  return `t=${ts},v1=${hmac}`;
}

function send(body: unknown, signature?: string | null) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // signature undefined → assina válido; null → não manda header; string → usa como está.
  const sig = signature === undefined ? sign(payload) : signature;
  if (sig !== null) headers['stripe-signature'] = sig;
  return app.request('/webhooks/stripe', { method: 'POST', headers, body: payload });
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

const invoicePaid = (subscription: string, id: string) => ({
  id,
  type: 'invoice.paid',
  data: { object: { subscription } },
});

describe('POST /webhooks/stripe', () => {
  it('assinatura inválida → 401 sem efeito no banco', async () => {
    const hid = await seedSub('sub_1', 'pending');

    const payload = JSON.stringify(invoicePaid('sub_1', 'evt_1'));
    const res = await send(payload, `t=${Math.floor(Date.now() / 1000)},v1=bad`);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
    expect(await subStatus('sub_1')).toBe('pending');
    expect(await housePlan(hid)).toBe('free');
  });

  it('invoice.paid válido → assinatura active e household pro', async () => {
    const hid = await seedSub('sub_1', 'pending');

    const res = await send(invoicePaid('sub_1', 'evt_conf'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await subStatus('sub_1')).toBe('active');
    expect(await housePlan(hid)).toBe('pro');
  });

  it('mesmo eventId 2x → segunda é no-op (idempotência por provider=stripe)', async () => {
    await seedSub('sub_1', 'pending');
    const evt = invoicePaid('sub_1', 'evt_dup');
    const payload = JSON.stringify(evt);
    const signature = sign(payload);

    expect((await send(payload, signature)).status).toBe(200);
    // reentrega do MESMO evento (mesma assinatura) não reaplica
    expect((await send(payload, signature)).status).toBe(200);
    const rows = await db()
      .select()
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.eventId, 'evt_dup'));
    expect(rows.length).toBe(1);
    expect(rows[0]!.provider).toBe('stripe');
  });

  it('assinatura desconhecida → 200 sem efeito', async () => {
    const res = await send(invoicePaid('sub_inexistente', 'evt_x'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('evento não mapeado → 200 sem efeito', async () => {
    await seedSub('sub_1', 'pending');
    const res = await send({
      id: 'evt_ignored',
      type: 'invoice.created',
      data: { object: { subscription: 'sub_1' } },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await subStatus('sub_1')).toBe('pending');
  });

  it('body inválido (não-JSON) mas assinado → 400 bad_payload', async () => {
    const res = await send('not json{');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_payload' });
  });

  it('customer.subscription.deleted → assinatura canceled', async () => {
    const hid = await seedSub('sub_1', 'active');
    // pré-condição: active + pro
    await db()
      .update(schema.households)
      .set({ plan: 'pro' })
      .where(eq(schema.households.id, hid));

    const res = await send({
      id: 'evt_del',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    });

    expect(res.status).toBe(200);
    expect(await subStatus('sub_1')).toBe('canceled');
  });
});
