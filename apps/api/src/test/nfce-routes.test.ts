import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { Hono } from 'hono';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';
import type { NfceLookup, NfceResult } from '../nfce/types.js';

// Banco real (Postgres em WASM) no lugar do db/index — mesmo molde do billing-routes.test.
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
const { nfceRoute } = await import('../routes/nfce.js');
const { setNfceLookup, resetNfceLookup } = await import('../nfce/index.js');

const app = new Hono().route('/nfce', nfceRoute);

let pg: PGlite;
const db = () => holder.db;

// Chaves de 44 dígitos (2 primeiros = código IBGE). RS=43, SP=35, MG=31, BA=29, SE=28.
const CHAVE_RS = '43250714200166000166650010000012341123456789';
const CHAVE_SP = '35250714200166000166650010000012341123456780';
const CHAVE_BA = '29250714200166000166650010000012341123456789';
const CHAVE_SE = '28250714200166000166650010000012341123456789';

// URL de consulta SVRS válida (host conhecido + p= v3: chave|3|tpAmb) pra passar no parseNfceQr.
function qrFor(chave: string): string {
  return `https://www.sefazvirtual.rs.gov.br/NFCE/consulta?p=${chave}|3|1`;
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
    `TRUNCATE nfce_imports, items, household_members, households, "user" RESTART IDENTITY CASCADE;`,
  );
  sessionHolder.user = null;
});

afterEach(() => {
  resetNfceLookup();
  vi.restoreAllMocks();
});

// ---- helpers ----
async function seed(role: 'owner' | 'member' | 'viewer' = 'owner', plan: 'free' | 'pro' = 'free') {
  const uid = uuidv7();
  await db()
    .insert(schema.user)
    .values({ id: uid, name: 'Fulano', email: `${uid}@x.com`, emailVerified: true });
  const hid = uuidv7();
  await db().insert(schema.households).values({ id: hid, name: 'Casa', createdBy: uid, plan });
  await db().insert(schema.householdMembers).values({ householdId: hid, userId: uid, role });
  await db().update(schema.user).set({ activeHouseholdId: hid }).where(eq(schema.user.id, uid));
  sessionHolder.user = { id: uid, name: 'Fulano', email: `${uid}@x.com`, emailVerified: true };
  return { uid, hid };
}

/** NfceResult fake com 2 itens (o matching sem catálogo → tudo "novo"). */
function fakeResult(uf: NfceResult['uf'] = 'RS'): NfceResult {
  return {
    emitente: { cnpj: '11222333000181', nome: 'Mercado Teste' },
    itens: [
      {
        descricao: 'ARROZ TP1 5KG CAMIL',
        quantidade: 1,
        unidade: 'UN',
        valorUnitCents: 2990,
        valorTotalCents: 2990,
        ean: '7896006711221',
      },
      {
        descricao: 'FEIJAO PRETO 1KG',
        quantidade: 2,
        unidade: 'UN',
        valorUnitCents: 890,
        valorTotalCents: 1780,
        ean: null,
      },
    ],
    totalCents: 4770,
    uf,
  };
}

/** Provider fake injetável — o override do roteador vence a tabela pra qualquer UF. */
function fakeLookup(over: Partial<NfceLookup> = {}): NfceLookup {
  return {
    family: 'svrs',
    fetchItems: vi.fn(async () => fakeResult()),
    ...over,
  };
}

function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function importRows(hid: string) {
  return db()
    .select()
    .from(schema.nfceImports)
    .where(eq(schema.nfceImports.householdId, hid));
}

describe('POST /nfce/lookup — happy path (NFCE-02 AC2)', () => {
  it('lookup ok → grava status parsed + itens + emitente + totalCents (cached:false)', async () => {
    const { hid } = await seed('owner');
    setNfceLookup(fakeLookup());

    const res = await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_RS) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.cached).toBe(false);
    expect(body.alreadyImported).toBe(false);
    expect(body.totalCents).toBe(4770);
    expect((body.emitente as { cnpj: string }).cnpj).toBe('11222333000181');
    expect((body.lines as unknown[]).length).toBe(2);

    const rows = await importRows(hid);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('parsed');
    expect(rows[0]!.itemCount).toBe(2);
    expect(rows[0]!.chave).toBe(CHAVE_RS);
    expect(rows[0]!.uf).toBe('RS');
    // rawJson guarda os itens (cache) — sem CPF (o fake nem tem CPF).
    expect((rows[0]!.rawJson as NfceResult).itens).toHaveLength(2);
  });

  it('catálogo vazio → todas as linhas vêm "novo" (itemId null)', async () => {
    await seed('owner');
    setNfceLookup(fakeLookup());
    const res = await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_RS) });
    const body = (await res.json()) as { lines: Array<{ itemId: string | null }> };
    expect(body.lines.every((l) => l.itemId === null)).toBe(true);
  });
});

describe('POST /nfce/lookup — cache/idempotência (NFCE-02 AC5)', () => {
  it('re-scan da mesma chave retorna cache (cached:true) sem re-consultar o portal', async () => {
    const { hid } = await seed('owner');
    const fetchItems = vi.fn(async () => fakeResult());
    setNfceLookup(fakeLookup({ fetchItems }));

    await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_RS) });
    expect(fetchItems).toHaveBeenCalledTimes(1);

    const res2 = await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_RS) });
    const body2 = (await res2.json()) as Record<string, unknown>;
    expect(res2.status).toBe(200);
    expect(body2.cached).toBe(true);
    // Não chamou o portal de novo.
    expect(fetchItems).toHaveBeenCalledTimes(1);
    // Não duplicou a linha (unique household+chave).
    expect(await importRows(hid)).toHaveLength(1);
  });

  it('nota já confirmada → cache com alreadyImported:true', async () => {
    const { hid } = await seed('owner');
    setNfceLookup(fakeLookup());
    await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_RS) });
    await post('/nfce/confirm', { chave: CHAVE_RS });

    const res = await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_RS) });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.cached).toBe(true);
    expect(body.alreadyImported).toBe(true);
    expect((await importRows(hid))[0]!.status).toBe('confirmed');
  });
});

describe('POST /nfce/lookup — erros tipados (NFCE-07)', () => {
  it('QR não-SEFAZ → 400 nfce_invalid_qr, sem gravar import', async () => {
    const { hid } = await seed('owner');
    setNfceLookup(fakeLookup());
    const res = await post('/nfce/lookup', { qrUrl: 'https://example.com/nao-e-nota' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'nfce_invalid_qr' });
    expect(await importRows(hid)).toHaveLength(0);
  });

  it('UF sem parser (BA) → 422 uf_unsupported + status failed', async () => {
    const { hid } = await seed('owner');
    // sem setNfceLookup: roteia pela tabela real (BA = unsupported → uf_unsupported).
    const res = await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_BA) });
    expect(res.status).toBe(422);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('uf_unsupported');
    expect(body.uf).toBe('BA');
    const rows = await importRows(hid);
    expect(rows[0]!.status).toBe('failed');
  });

  it('SE sem INFOSIMPLES_TOKEN → 501 state_unsupported + status failed', async () => {
    const { hid } = await seed('owner');
    const res = await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_SE) });
    expect(res.status).toBe(501);
    expect((await res.json() as { error: string }).error).toBe('state_unsupported');
    expect((await importRows(hid))[0]!.status).toBe('failed');
  });

  it('portal timeout → 504 nfce_portal_error + status failed (não conta quota)', async () => {
    const { hid } = await seed('owner');
    const { NfceLookupError } = await import('../nfce/index.js');
    setNfceLookup(
      fakeLookup({
        fetchItems: vi.fn(async () => {
          throw new NfceLookupError('nfce_portal_error', 'RS');
        }),
      }),
    );
    const res = await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_RS) });
    expect(res.status).toBe(504);
    expect((await res.json() as { error: string }).error).toBe('nfce_portal_error');
    expect((await importRows(hid))[0]!.status).toBe('failed');
  });

  it('adapter down → 502 nfce_provider_error', async () => {
    await seed('owner');
    const { NfceLookupError } = await import('../nfce/index.js');
    setNfceLookup(
      fakeLookup({
        fetchItems: vi.fn(async () => {
          throw new NfceLookupError('nfce_provider_error', 'RS');
        }),
      }),
    );
    const res = await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_RS) });
    expect(res.status).toBe(502);
    expect((await res.json() as { error: string }).error).toBe('nfce_provider_error');
  });

  it('parse vazio → 422 nfce_parse_failed', async () => {
    await seed('owner');
    const { NfceLookupError } = await import('../nfce/index.js');
    setNfceLookup(
      fakeLookup({
        fetchItems: vi.fn(async () => {
          throw new NfceLookupError('nfce_parse_failed', 'RS');
        }),
      }),
    );
    const res = await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_RS) });
    expect(res.status).toBe(422);
    expect((await res.json() as { error: string }).error).toBe('nfce_parse_failed');
  });
});

describe('POST /nfce/lookup — autorização', () => {
  it('viewer é bloqueado pelo middleware (read_only 403)', async () => {
    await seed('viewer');
    setNfceLookup(fakeLookup());
    const res = await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_RS) });
    expect(res.status).toBe(403);
    expect((await res.json() as { error: string }).error).toBe('read_only');
  });
});

describe('POST /nfce/confirm', () => {
  it('parsed → confirmed (idempotente)', async () => {
    const { hid } = await seed('owner');
    setNfceLookup(fakeLookup());
    await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_RS) });

    const res = await post('/nfce/confirm', { chave: CHAVE_RS });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await importRows(hid))[0]!.status).toBe('confirmed');

    // confirmar de novo → ainda ok (idempotente)
    const res2 = await post('/nfce/confirm', { chave: CHAVE_RS });
    expect(res2.status).toBe(200);
  });

  it('chave inexistente → 404 nfce_import_not_found', async () => {
    await seed('owner');
    const res = await post('/nfce/confirm', { chave: CHAVE_SP });
    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('nfce_import_not_found');
  });
});

describe('GET /nfce/quota', () => {
  it('devolve {used, limit, plan} do mês corrente', async () => {
    await seed('owner', 'free');
    setNfceLookup(fakeLookup());
    await post('/nfce/lookup', { qrUrl: qrFor(CHAVE_RS) });

    const res = await app.request('/nfce/quota');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ used: 1, limit: 2, plan: 'free' });
  });
});
