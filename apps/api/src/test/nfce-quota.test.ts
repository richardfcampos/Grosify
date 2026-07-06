import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { and, eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { Hono } from 'hono';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';
import type { NfceLookup, NfceResult } from '../nfce/types.js';

// Banco real (Postgres em WASM) no lugar do db/index — molde do billing/nfce-routes.
const holder = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock('../db/index.js', () => ({
  get db() {
    return holder.db;
  },
}));

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

const { nfceRoute } = await import('../routes/nfce.js');
const { setNfceLookup, resetNfceLookup } = await import('../nfce/index.js');

const app = new Hono().route('/nfce', nfceRoute);

let pg: PGlite;
const db = () => holder.db;

// Chave de 44 díg.: prefixo de UF (2 díg. IBGE) + preenchimento fixo, com os 6 últimos
// dígitos = índice → cada n gera uma chave distinta (mesma chave = cache, não conta).
function chaveFor(ibge: string, n: number): string {
  const base = (ibge + '3'.repeat(42)).slice(0, 44); // 44 díg., começa pelo IBGE
  const suffix = String(n).padStart(6, '0');
  return base.slice(0, 38) + suffix; // 38 fixos + 6 variáveis = 44
}
const chaveRs = (n: number) => chaveFor('43', n);
function qrFor(chave: string): string {
  return `https://www.sefazvirtual.rs.gov.br/NFCE/consulta?p=${chave}|3|1`;
}
// URL de UF sem parser (BA=29) pra forçar lookup falho.
function qrBa(n: number): string {
  return `https://www.sefazvirtual.rs.gov.br/NFCE/consulta?p=${chaveFor('29', n)}|3|1`;
}

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
    `TRUNCATE nfce_imports, household_members, households, "user" RESTART IDENTITY CASCADE;`,
  );
  sessionHolder.user = null;
});

afterEach(() => {
  resetNfceLookup();
  vi.restoreAllMocks();
});

async function seed(plan: 'free' | 'pro') {
  const uid = uuidv7();
  await db()
    .insert(schema.user)
    .values({ id: uid, name: 'Fulano', email: `${uid}@x.com`, emailVerified: true });
  const hid = uuidv7();
  await db().insert(schema.households).values({ id: hid, name: 'Casa', createdBy: uid, plan });
  await db().insert(schema.householdMembers).values({ householdId: hid, userId: uid, role: 'owner' });
  await db().update(schema.user).set({ activeHouseholdId: hid }).where(eq(schema.user.id, uid));
  sessionHolder.user = { id: uid, name: 'Fulano', email: `${uid}@x.com`, emailVerified: true };
  return { uid, hid };
}

function fakeResult(): NfceResult {
  return {
    emitente: { cnpj: '11222333000181', nome: 'Mercado' },
    itens: [{ descricao: 'X', quantidade: 1, unidade: 'UN', valorUnitCents: 100, valorTotalCents: 100, ean: null }],
    totalCents: 100,
    uf: 'RS',
  };
}
function fakeLookup(): NfceLookup {
  return { family: 'svrs', fetchItems: vi.fn(async () => fakeResult()) };
}

function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Semeia uma linha de import já parseada diretamente (com createdAt controlável) —
 * mais rápido que N lookups e permite manipular a data pra testar a virada de mês.
 */
async function seedImport(
  hid: string,
  n: number,
  status: 'parsed' | 'confirmed' | 'failed',
  createdAt = new Date(),
) {
  await db().insert(schema.nfceImports).values({
    id: uuidv7(),
    householdId: hid,
    chave: chaveRs(n),
    uf: 'RS',
    status,
    itemCount: 1,
    rawJson: status === 'failed' ? null : fakeResult(),
    createdAt,
  });
}

describe('quota Free (NFCE-04 AC1)', () => {
  it('2 imports no mês → 3º lookup responde 403 nfce_quota_free', async () => {
    const { hid } = await seed('free');
    await seedImport(hid, 1, 'parsed');
    await seedImport(hid, 2, 'confirmed'); // confirmed também conta
    setNfceLookup(fakeLookup());

    const res = await post('/nfce/lookup', { qrUrl: qrFor(chaveRs(3)) });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'nfce_quota_free' });
    // Não gravou a 3ª (quota barra ANTES do portal).
    const rows = await db().select().from(schema.nfceImports).where(eq(schema.nfceImports.householdId, hid));
    expect(rows).toHaveLength(2);
  });

  it('flip pro → passa da faixa Free (o mesmo estado que barrava Free vira ok)', async () => {
    const { hid } = await seed('pro');
    await seedImport(hid, 1, 'parsed');
    await seedImport(hid, 2, 'parsed');
    setNfceLookup(fakeLookup());

    const res = await post('/nfce/lookup', { qrUrl: qrFor(chaveRs(3)) });
    expect(res.status).toBe(200);
  });
});

describe('quota Pro (NFCE-04 AC2)', () => {
  it('60 imports no mês → 61º lookup responde 429 nfce_quota_pro', async () => {
    const { hid } = await seed('pro');
    for (let i = 1; i <= 60; i++) await seedImport(hid, i, 'parsed');
    setNfceLookup(fakeLookup());

    const res = await post('/nfce/lookup', { qrUrl: qrFor(chaveRs(61)) });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'nfce_quota_pro' });
  });

  it('59 imports → 60º ainda passa (o teto é exclusivo: bloqueia a partir do 61º)', async () => {
    const { hid } = await seed('pro');
    for (let i = 1; i <= 59; i++) await seedImport(hid, i, 'parsed');
    setNfceLookup(fakeLookup());

    const res = await post('/nfce/lookup', { qrUrl: qrFor(chaveRs(60)) });
    expect(res.status).toBe(200);
  });
});

describe('o que NÃO consome quota (NFCE-04 AC3/AC4)', () => {
  it('lookup falho (portal fora / UF sem parser) NÃO conta — Free ainda importa', async () => {
    const { hid } = await seed('free');
    // 3 lookups falhos (BA = uf_unsupported) → nenhum conta pra quota.
    await post('/nfce/lookup', { qrUrl: qrBa(1) });
    await post('/nfce/lookup', { qrUrl: qrBa(2) });
    await post('/nfce/lookup', { qrUrl: qrBa(3) });
    const failed = await db()
      .select()
      .from(schema.nfceImports)
      .where(and(eq(schema.nfceImports.householdId, hid), eq(schema.nfceImports.status, 'failed')));
    expect(failed).toHaveLength(3);

    // Agora um lookup válido ainda passa (os 3 failed não consumiram os 2 do Free).
    setNfceLookup(fakeLookup());
    const res = await post('/nfce/lookup', { qrUrl: qrFor(chaveRs(9)) });
    expect(res.status).toBe(200);
  });

  it('re-scan de chave já parseada retorna cache e NÃO incrementa', async () => {
    const { hid } = await seed('free');
    setNfceLookup(fakeLookup());
    // 1 import real; depois 5 re-scans da MESMA chave → cache, não conta.
    await post('/nfce/lookup', { qrUrl: qrFor(chaveRs(1)) });
    for (let i = 0; i < 5; i++) await post('/nfce/lookup', { qrUrl: qrFor(chaveRs(1)) });

    // used ainda é 1 → um 2º import de chave NOVA ainda passa (não estourou o Free=2).
    const quota = await app.request('/nfce/quota');
    expect(await quota.json()).toEqual({ used: 1, limit: 2, plan: 'free' });
    const res = await post('/nfce/lookup', { qrUrl: qrFor(chaveRs(2)) });
    expect(res.status).toBe(200);
  });
});

describe('virada de mês zera o contador (NFCE-04 AC5)', () => {
  it('imports do mês passado NÃO contam no mês corrente', async () => {
    const { hid } = await seed('free');
    // 2 imports com createdAt no mês anterior → fora da janela do mês corrente.
    const now = new Date();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    await seedImport(hid, 1, 'parsed', lastMonth);
    await seedImport(hid, 2, 'parsed', lastMonth);
    setNfceLookup(fakeLookup());

    // Contador do mês corrente = 0 → o import passa (não bate no Free=2 do mês passado).
    const quota = await app.request('/nfce/quota');
    expect((await quota.json() as { used: number }).used).toBe(0);
    const res = await post('/nfce/lookup', { qrUrl: qrFor(chaveRs(3)) });
    expect(res.status).toBe(200);
  });
});
