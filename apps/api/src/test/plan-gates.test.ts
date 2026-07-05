import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { and, count, eq } from 'drizzle-orm';
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

// Sessão controlável por teste (requireHousehold usa auth.api.getSession).
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

// R2 ligado (presign existe) — assim o gate pro_required é alcançado (o 501 vem antes).
vi.mock('../lib/r2.js', () => ({
  r2Enabled: true,
  presignPut: async () => 'https://r2.test/put',
  presignGet: async () => 'https://r2.test/get',
}));

// Poke SSE é irrelevante ao teste — stub pra não abrir handles.
vi.mock('../lib/poke.js', () => ({ pokeHousehold: () => {} }));

const { catalogRoute } = await import('../routes/catalog.js');
const { shoppingRoute } = await import('../routes/shopping.js');
const { uploadsRoute } = await import('../routes/uploads.js');
const { householdsRoute } = await import('../routes/households.js');

const app = new Hono()
  .route('/catalog', catalogRoute)
  .route('/shopping', shoppingRoute)
  .route('/uploads', uploadsRoute)
  .route('/households', householdsRoute);

let pg: PGlite;
const db = () => holder.db;

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
    `TRUNCATE items, shopping_lists, stores, price_records, stock_movements,
     household_invites, subscriptions, webhook_events, household_members, households,
     "user" RESTART IDENTITY CASCADE;`,
  );
  sessionHolder.user = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- helpers ----
async function seedUser(name = 'u') {
  const uid = uuidv7();
  await db().insert(schema.user).values({ id: uid, name, email: `${uid}@x.com`, emailVerified: true });
  return uid;
}
async function seedHousehold(
  createdBy: string,
  opts: { plan?: 'free' | 'pro'; planOverride?: 'pro' } = {},
) {
  const hid = uuidv7();
  await db()
    .insert(schema.households)
    .values({
      id: hid,
      name: 'Casa',
      createdBy,
      currency: 'BRL',
      plan: opts.plan ?? 'free',
      planOverride: opts.planOverride ?? null,
    });
  return hid;
}
async function addMember(hid: string, uid: string, role: 'owner' | 'admin' | 'member' | 'viewer' = 'owner') {
  await db().insert(schema.householdMembers).values({ householdId: hid, userId: uid, role });
}
/** Loga um usuário como membro owner da casa e ativa a sessão. */
async function actAs(uid: string, hid: string) {
  await db().update(schema.user).set({ activeHouseholdId: hid }).where(eq(schema.user.id, uid));
  const [u] = await db().select().from(schema.user).where(eq(schema.user.id, uid));
  sessionHolder.user = { id: uid, name: u!.name, email: u!.email, emailVerified: true };
}
async function seedItems(hid: string, n: number) {
  for (let i = 0; i < n; i++) {
    await db().insert(schema.items).values({ id: uuidv7(), householdId: hid, name: `item ${i}`, unit: 'un' });
  }
}
async function seedLists(hid: string, n: number) {
  for (let i = 0; i < n; i++) {
    await db().insert(schema.shoppingLists).values({ id: uuidv7(), householdId: hid, name: `lista ${i}` });
  }
}

function postJson(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function putJson(path: string, body: unknown) {
  return app.request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('gate de itens (BILL-01 AC1)', () => {
  it('free com 30 itens → 31º responde 403 item_limit_reached', async () => {
    const uid = await seedUser();
    const hid = await seedHousehold(uid, { plan: 'free' });
    await addMember(hid, uid);
    await actAs(uid, hid);
    await seedItems(hid, 30);

    const res = await postJson('/catalog/items', {
      id: uuidv7(),
      name: 'Arroz',
      unit: 'un',
      barcodes: [],
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'item_limit_reached' });
  });

  it('pro é ilimitado (31º item passa; AC5)', async () => {
    const uid = await seedUser();
    const hid = await seedHousehold(uid, { plan: 'pro' });
    await addMember(hid, uid);
    await actAs(uid, hid);
    await seedItems(hid, 30);

    const res = await postJson('/catalog/items', {
      id: uuidv7(),
      name: 'Arroz',
      unit: 'un',
      barcodes: [],
    });

    expect(res.status).toBe(201);
  });

  it('planOverride=pro numa casa free ignora o gate de itens (BILL-06)', async () => {
    const uid = await seedUser();
    const hid = await seedHousehold(uid, { plan: 'free', planOverride: 'pro' });
    await addMember(hid, uid);
    await actAs(uid, hid);
    await seedItems(hid, 30);

    const res = await postJson('/catalog/items', {
      id: uuidv7(),
      name: 'Arroz',
      unit: 'un',
      barcodes: [],
    });

    expect(res.status).toBe(201);
  });
});

describe('gate de listas (BILL-01 AC2)', () => {
  it('free com 2 listas → 3ª responde 403 list_limit_reached', async () => {
    const uid = await seedUser();
    const hid = await seedHousehold(uid, { plan: 'free' });
    await addMember(hid, uid);
    await actAs(uid, hid);
    await seedLists(hid, 2);

    const res = await postJson('/shopping/lists', { id: uuidv7(), name: 'Terceira' });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'list_limit_reached' });
  });

  it('pro cria a 3ª lista sem gate (AC5)', async () => {
    const uid = await seedUser();
    const hid = await seedHousehold(uid, { plan: 'pro' });
    await addMember(hid, uid);
    await actAs(uid, hid);
    await seedLists(hid, 2);

    const res = await postJson('/shopping/lists', { id: uuidv7(), name: 'Terceira' });

    expect(res.status).toBe(201);
  });
});

describe('gate de membros no /join (BILL-01 AC3)', () => {
  async function seedInvite(hid: string, createdBy: string) {
    const code = 'ABCDEFGH';
    await db().insert(schema.householdInvites).values({
      code,
      householdId: hid,
      createdBy,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    return code;
  }

  it('free com 2 membros → 3º aceitar convite responde 403 member_limit_reached', async () => {
    const owner = await seedUser('owner');
    const hid = await seedHousehold(owner, { plan: 'free' });
    await addMember(hid, owner, 'owner');
    const second = await seedUser('second');
    await addMember(hid, second, 'member');
    const code = await seedInvite(hid, owner);

    const third = await seedUser('third');
    await actAs(third, hid); // sessão do 3º (não vira membro ainda)
    const res = await postJson('/households/join', { code });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'member_limit_reached' });
    // não entrou
    const [{ value: n } = { value: 0 }] = await db()
      .select({ value: count() })
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.householdId, hid));
    expect(n).toBe(2);
  });

  it('pro permite o 3º membro entrar (AC5)', async () => {
    const owner = await seedUser('owner');
    const hid = await seedHousehold(owner, { plan: 'pro' });
    await addMember(hid, owner, 'owner');
    const second = await seedUser('second');
    await addMember(hid, second, 'member');
    const code = await seedInvite(hid, owner);

    const third = await seedUser('third');
    await actAs(third, hid);
    const res = await postJson('/households/join', { code });

    expect(res.status).toBe(201);
    const [{ value: n } = { value: 0 }] = await db()
      .select({ value: count() })
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.householdId, hid));
    expect(n).toBe(3);
  });
});

describe('gate de fotos no presign (BILL-01 AC4)', () => {
  it('free → 403 pro_required', async () => {
    const uid = await seedUser();
    const hid = await seedHousehold(uid, { plan: 'free' });
    await addMember(hid, uid);
    await actAs(uid, hid);

    const res = await postJson('/uploads/presign', { kind: 'item', id: uuidv7() });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'pro_required' });
  });

  it('pro → presign retorna URL', async () => {
    const uid = await seedUser();
    const hid = await seedHousehold(uid, { plan: 'pro' });
    await addMember(hid, uid);
    await actAs(uid, hid);

    const res = await postJson('/uploads/presign', { kind: 'item', id: uuidv7() });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toContain('https://r2.test');
  });
});

describe('FK→4xx em rotas dependentes (dead-letter guard)', () => {
  it('movements com itemId inexistente → 409 ref_missing (não 500)', async () => {
    const uid = await seedUser();
    const hid = await seedHousehold(uid, { plan: 'pro' });
    await addMember(hid, uid);
    await actAs(uid, hid);

    const res = await postJson('/shopping/movements', {
      id: uuidv7(),
      itemId: uuidv7(), // não existe → FK violation
      type: 'purchase',
      qty: 1,
      balanceAfter: 1,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'ref_missing' });
  });
});
