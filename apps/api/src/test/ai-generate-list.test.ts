import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { Hono } from 'hono';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';

/**
 * Integração da rota /ai/generate-list (NL-02/NL-04) — molde do nfce-routes.test:
 * PGlite por arquivo, sessão e db mockados. O Gemini é o `fetch` global stubado,
 * roteado por URL: `:generateContent` → resposta de geração controlável por teste;
 * `:batchEmbedContents` → sempre não-ok (embed degrada pra fuzzy — matching
 * determinístico contra o catálogo seedado, sem fabricar vetor 768d).
 *
 * Deriva dos ACs: pro gera (happy); free → 403 pro_required SEM chamar Gemini (spy);
 * viewer bloqueado; sem chave → 501 sem chamar; falha dupla → 502 (spy prova 2 chamadas
 * = 1 retry); prompt curto/longo → 400; array vazio → 200 []; catálogo vazio → tudo novo.
 */

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

// importa DEPOIS dos mocks (a rota puxa match-for-household → embed-cache → db/index)
const { aiRoute } = await import('../routes/ai.js');

const app = new Hono().route('/ai', aiRoute);

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
  await pg.exec(`TRUNCATE items, household_members, households, "user" RESTART IDENTITY CASCADE;`);
  sessionHolder.user = null;
  // A rota lê process.env.GEMINI_API_KEY direto — por padrão presente (feature ligada).
  process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

// ---- helpers ----
async function seed(role: 'owner' | 'member' | 'viewer' = 'owner', plan: 'free' | 'pro' = 'pro') {
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

async function seedItem(hid: string, name: string): Promise<string> {
  const id = uuidv7();
  await db().insert(schema.items).values({ id, householdId: hid, name });
  return id;
}

/**
 * Stub do fetch global roteado por URL. `genLines` (JSON string) é o texto do 1º
 * candidato do generateContent — quando null, a chamada de geração devolve `ok:false`
 * (força o null→retry→502). O embed (`batchEmbedContents`) é sempre não-ok pra degradar
 * pra fuzzy. Devolve o spy pra asserir nº de chamadas de geração.
 */
function stubGemini(genLines: string | null): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (url: string) => {
    if (typeof url === 'string' && url.includes(':batchEmbedContents')) {
      return { ok: false, json: async () => ({}) };
    }
    // :generateContent
    if (genLines === null) return { ok: false, json: async () => ({}) };
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: genLines }] } }] }),
    };
  });
  vi.stubGlobal('fetch', spy as unknown as typeof fetch);
  return spy;
}

/** Conta só as chamadas de geração (ignora as de embedding do matching). */
function generateCalls(spy: ReturnType<typeof vi.fn>): number {
  return spy.mock.calls.filter(([url]) => typeof url === 'string' && url.includes(':generateContent')).length;
}

function post(body: unknown) {
  return app.request('/ai/generate-list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /ai/generate-list — happy path Pro (NL-02 AC1/AC2)', () => {
  it('pro → 200 com lines casadas contra o catálogo seedado', async () => {
    const { hid } = await seed('owner', 'pro');
    const arrozId = await seedItem(hid, 'Arroz');
    await seedItem(hid, 'Feijão');
    const spy = stubGemini(
      JSON.stringify([
        { name: 'Arroz', qty: 2, unit: 'kg' }, // casa o catálogo
        { name: 'Guardanapo', qty: 1, unit: 'un' }, // novo
      ]),
    );

    const res = await post({ prompt: 'churrasco pra 10 pessoas' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ descricao: string }>;
      lines: Array<{ itemId: string | null; suggestedName: string }>;
    };
    expect(generateCalls(spy)).toBe(1); // sucesso na 1ª → sem retry
    expect(body.items).toHaveLength(2);
    expect(body.lines[0]!.itemId).toBe(arrozId); // "Arroz" casou
    expect(body.lines[1]!.itemId).toBeNull(); // "Guardanapo" novo
    expect(body.lines[1]!.suggestedName).toBe('Guardanapo');
  });

  it('catálogo vazio → todas as linhas "novo" (isNew), fluxo funciona', async () => {
    await seed('owner', 'pro');
    stubGemini(JSON.stringify([{ name: 'Arroz', qty: 1, unit: 'kg' }]));

    const res = await post({ prompt: 'lista de mercado' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lines: Array<{ itemId: string | null }> };
    expect(body.lines.every((l) => l.itemId === null)).toBe(true);
  });

  it('array vazio (modelo não entendeu) → 200 {items:[], lines:[]} (não é erro)', async () => {
    await seed('owner', 'pro');
    stubGemini('[]');

    const res = await post({ prompt: 'asdkjhaskjd' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ items: [], lines: [] });
  });

  it('listId opcional é ecoado na resposta (rota stateless, não grava nada)', async () => {
    await seed('owner', 'pro');
    stubGemini(JSON.stringify([{ name: 'Pão', qty: 1, unit: 'un' }]));
    const listId = uuidv7();

    const res = await post({ prompt: 'café da manhã', listId });
    const body = (await res.json()) as { listId?: string };
    expect(body.listId).toBe(listId);
  });
});

describe('POST /ai/generate-list — gate Pro (NL-02 AC1/AC4)', () => {
  it('free → 403 pro_required ANTES de tocar o Gemini (spy prova 0 chamadas)', async () => {
    await seed('owner', 'free');
    const spy = stubGemini(JSON.stringify([{ name: 'X', qty: 1, unit: 'un' }]));

    const res = await post({ prompt: 'churrasco pra 10' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'pro_required' });
    expect(generateCalls(spy)).toBe(0); // não gastou chamada externa
  });

  it('viewer é bloqueado pelo middleware (read_only 403 — POST é mutação)', async () => {
    await seed('viewer', 'pro');
    stubGemini(JSON.stringify([{ name: 'X', qty: 1, unit: 'un' }]));

    const res = await post({ prompt: 'churrasco pra 10' });
    expect(res.status).toBe(403);
    expect((await res.json()) as { error: string }).toEqual({ error: 'read_only' });
  });
});

describe('POST /ai/generate-list — robustez (NL-04)', () => {
  it('sem GEMINI_API_KEY → 501 ai_unavailable, sem tocar o Gemini', async () => {
    await seed('owner', 'pro');
    delete process.env.GEMINI_API_KEY;
    const spy = stubGemini(JSON.stringify([{ name: 'X', qty: 1, unit: 'un' }]));

    const res = await post({ prompt: 'churrasco pra 10' });
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: 'ai_unavailable' });
    expect(generateCalls(spy)).toBe(0);
  });

  it('falha persistente do Gemini → 502 ai_generation_failed (spy prova 2 chamadas = 1 retry)', async () => {
    await seed('owner', 'pro');
    const spy = stubGemini(null); // generateContent sempre ok:false → null

    const res = await post({ prompt: 'churrasco pra 10' });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'ai_generation_failed' });
    expect(generateCalls(spy)).toBe(2); // 1ª + 1 retry
  });

  it('prompt curto (<3) → 400 prompt_too_short, sem tocar o Gemini', async () => {
    await seed('owner', 'pro');
    const spy = stubGemini(JSON.stringify([{ name: 'X', qty: 1, unit: 'un' }]));

    const res = await post({ prompt: 'ab' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'prompt_too_short' });
    expect(generateCalls(spy)).toBe(0);
  });

  it('prompt longo (>500) → 400 prompt_too_long, sem tocar o Gemini', async () => {
    await seed('owner', 'pro');
    const spy = stubGemini(JSON.stringify([{ name: 'X', qty: 1, unit: 'un' }]));

    const res = await post({ prompt: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'prompt_too_long' });
    expect(generateCalls(spy)).toBe(0);
  });
});

describe('rate limit da rota (NL-03 — anti-abuso mesmo sendo Pro)', () => {
  it('11ª requisição no minuto → 429 rate_limited', async () => {
    // free basta: o rateLimit roda ANTES do gate Pro, então cada 403 conta no bucket.
    // IP dedicado via x-forwarded-for isola este teste dos buckets dos demais.
    await seed('owner', 'free');
    const req = () =>
      app.request('/ai/generate-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.99.99.99' },
        body: JSON.stringify({ prompt: 'lista de mercado' }),
      });

    for (let i = 0; i < 10; i++) {
      const r = await req();
      expect(r.status).toBe(403); // passa no rate limit, barra no gate Pro
    }
    const r11 = await req();
    expect(r11.status).toBe(429);
    expect(await r11.json()).toEqual({ error: 'rate_limited' });
  });
});
