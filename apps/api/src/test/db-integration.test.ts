import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { and, eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';

// Banco real (Postgres em WASM) no lugar do db/index (que exige DATABASE_URL).
const holder = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock('../db/index.js', () => ({
  get db() {
    return holder.db;
  },
}));

// importa DEPOIS do mock (vi.mock é hoisted) — assim as libs usam o banco de teste
const { hiddenListIds, hiddenSessionIds, visibleListWhere } = await import('../lib/list-privacy.js');
const { resolveActiveHouseholdId, setActiveHousehold } = await import('../lib/active-household.js');
const { checkLock, clearAttempts, recordFailure } = await import('../lib/account-lockout.js');
const { isSuppressed, suppress } = await import('../lib/email-suppression.js');

let pg: PGlite;
const db = () => holder.db;

beforeAll(async () => {
  pg = new PGlite();
  holder.db = drizzle(pg, { schema });
  // Aplica as migrações via pg.exec (multi-statement) — o migrator do drizzle envia
  // cada arquivo como um prepared statement único e o pglite recusa migrações custom
  // com vários comandos (ex.: o trigger de server_version).
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
    `TRUNCATE shopping_session_items, shopping_sessions, shopping_list_entries, shopping_lists,
     subscriptions, webhook_events,
     household_members, households, auth_attempts, email_suppression, "user" RESTART IDENTITY CASCADE;`,
  );
});

// ---- helpers de seed ----
async function seedUser(id: string, email: string) {
  await db().insert(schema.user).values({ id, name: id, email, emailVerified: true });
}
async function seedHousehold(name: string, createdBy: string): Promise<string> {
  const id = uuidv7();
  await db().insert(schema.households).values({ id, name, createdBy, currency: 'BRL' });
  return id;
}
async function addMember(householdId: string, userId: string, joinedAt?: Date) {
  await db()
    .insert(schema.householdMembers)
    .values({ householdId, userId, role: 'member', ...(joinedAt ? { joinedAt } : {}) });
}
async function seedList(householdId: string, opts: { isPrivate?: boolean; ownerId?: string } = {}) {
  const id = uuidv7();
  await db()
    .insert(schema.shoppingLists)
    .values({
      id,
      householdId,
      name: 'L',
      isPrivate: opts.isPrivate ?? false,
      ownerId: opts.ownerId ?? null,
    });
  return id;
}

describe('list-privacy (silo)', () => {
  it('esconde lista privada de OUTRO membro; o dono vê a sua', async () => {
    await seedUser('a', 'a@x.com');
    await seedUser('b', 'b@x.com');
    const h = await seedHousehold('Casa', 'a');
    await addMember(h, 'a');
    await addMember(h, 'b');
    await seedList(h); // compartilhada
    const priv = await seedList(h, { isPrivate: true, ownerId: 'a' });

    expect(await hiddenListIds(h, 'a')).toEqual([]); // dono não esconde nada
    expect(await hiddenListIds(h, 'b')).toEqual([priv]); // B não vê a privada de A
  });

  it('visibleListWhere filtra a privada de outro na query', async () => {
    await seedUser('a', 'a@x.com');
    const h = await seedHousehold('Casa', 'a');
    await addMember(h, 'a');
    const shared = await seedList(h);
    await seedList(h, { isPrivate: true, ownerId: 'a' });

    const seenByB = await db()
      .select({ id: schema.shoppingLists.id })
      .from(schema.shoppingLists)
      .where(and(eq(schema.shoppingLists.householdId, h), visibleListWhere('b')));
    expect(seenByB.map((r) => r.id)).toEqual([shared]); // só a compartilhada

    const seenByA = await db()
      .select({ id: schema.shoppingLists.id })
      .from(schema.shoppingLists)
      .where(and(eq(schema.shoppingLists.householdId, h), visibleListWhere('a')));
    expect(seenByA.length).toBe(2); // dono vê as duas
  });

  it('hiddenSessionIds mapeia sessões de listas escondidas', async () => {
    await seedUser('a', 'a@x.com');
    const h = await seedHousehold('Casa', 'a');
    await addMember(h, 'a');
    const priv = await seedList(h, { isPrivate: true, ownerId: 'a' });
    const sid = uuidv7();
    await db()
      .insert(schema.shoppingSessions)
      .values({ id: sid, householdId: h, listId: priv, status: 'active', startedAt: new Date() });

    expect(await hiddenSessionIds(h, [priv])).toEqual([sid]);
    expect(await hiddenSessionIds(h, [])).toEqual([]);
  });
});

describe('active-household', () => {
  it('resolve primeira casa quando active=null e faz backfill', async () => {
    await seedUser('u', 'u@x.com');
    const h1 = await seedHousehold('H1', 'u');
    const h2 = await seedHousehold('H2', 'u');
    await addMember(h1, 'u', new Date('2026-01-01'));
    await addMember(h2, 'u', new Date('2026-02-01'));

    expect(await resolveActiveHouseholdId('u')).toBe(h1); // mais antiga
    const [row] = await db().select({ a: schema.user.activeHouseholdId }).from(schema.user).where(eq(schema.user.id, 'u'));
    expect(row?.a).toBe(h1); // backfill persistiu
  });

  it('switch valida membership e troca a ativa', async () => {
    await seedUser('u', 'u@x.com');
    await seedUser('x', 'x@x.com');
    const h1 = await seedHousehold('H1', 'u');
    const h2 = await seedHousehold('H2', 'u');
    const alheia = await seedHousehold('Alheia', 'x');
    await addMember(h1, 'u');
    await addMember(h2, 'u');

    expect(await setActiveHousehold('u', h2)).toBe(true);
    expect(await resolveActiveHouseholdId('u')).toBe(h2);
    expect(await setActiveHousehold('u', alheia)).toBe(false); // não é membro
  });

  it('casa ativa que perdeu membership cai pra primeira (auto-cura)', async () => {
    await seedUser('u', 'u@x.com');
    const h1 = await seedHousehold('H1', 'u');
    const h2 = await seedHousehold('H2', 'u');
    await addMember(h1, 'u', new Date('2026-01-01'));
    await addMember(h2, 'u', new Date('2026-02-01'));
    await setActiveHousehold('u', h2);
    // sai da h2
    await db()
      .delete(schema.householdMembers)
      .where(and(eq(schema.householdMembers.userId, 'u'), eq(schema.householdMembers.householdId, h2)));

    expect(await resolveActiveHouseholdId('u')).toBe(h1);
  });
});

describe('account-lockout', () => {
  it('trava após 5 falhas na janela; limpa libera', async () => {
    const email = 'brute@x.com';
    for (let i = 0; i < 4; i++) await recordFailure(email);
    expect(await checkLock(email)).toBeNull(); // 4 < 5

    await recordFailure(email);
    const lock = await checkLock(email);
    expect(lock).not.toBeNull();
    expect(lock!.retryAfterSec).toBeGreaterThan(0);

    await clearAttempts(email);
    expect(await checkLock(email)).toBeNull();
  });
});

describe('email-suppression', () => {
  it('marca e checa; idempotente', async () => {
    await suppress('Bounce@X.com', 'bounce'); // normaliza lowercase
    expect(await isSuppressed('bounce@x.com')).toBe(true);
    expect(await isSuppressed('outro@x.com')).toBe(false);
    await suppress('bounce@x.com', 'bounce'); // 2ª vez não lança
    expect(await isSuppressed('bounce@x.com')).toBe(true);
  });
});
