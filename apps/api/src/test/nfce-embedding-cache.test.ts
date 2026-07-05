import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';

// Banco real (Postgres em WASM) no lugar do db/index — mesmo molde de billing-routes.
const holder = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock('../db/index.js', () => ({
  get db() {
    return holder.db;
  },
}));

// importa DEPOIS do mock
const { embedAndCacheCatalog, invalidateEmbedding, loadCatalog } = await import('../nfce/embed-cache.js');
const { matchItems } = await import('../nfce/matching.js');

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

let householdId: string;

beforeEach(async () => {
  await pg.exec(`TRUNCATE items, households, "user" RESTART IDENTITY CASCADE;`);
  await db().insert(schema.user).values({ id: 'u1', name: 'U', email: 'u@x.com', emailVerified: true });
  householdId = uuidv7();
  await db().insert(schema.households).values({ id: householdId, name: 'Casa', createdBy: 'u1', currency: 'BRL' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Insere um item (opcionalmente já com vetor cacheado). */
async function seedItem(name: string, embedding: number[] | null = null): Promise<string> {
  const id = uuidv7();
  await db().insert(schema.items).values({ id, householdId, name, embedding });
  return id;
}

/** Lê o vetor persistido de um item. */
async function readEmbedding(id: string): Promise<number[] | null> {
  const [row] = await db().select({ embedding: schema.items.embedding }).from(schema.items).where(eq(schema.items.id, id));
  return row?.embedding ?? null;
}

const KEY_ENV = { GEMINI_API_KEY: 'test-key' };

describe('embedAndCacheCatalog — grava e reusa embedding (NFCE-03 AC6)', () => {
  it('item sem cache: gera embedding e persiste na coluna items.embedding', async () => {
    const id = await seedItem('Arroz');
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [{ values: [0.1, 0.2, 0.3] }] }),
    }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const rows = await loadCatalog(householdId);
    const enriched = await embedAndCacheCatalog(householdId, rows, KEY_ENV);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(enriched.find((r) => r.id === id)!.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(await readEmbedding(id)).toEqual([0.1, 0.2, 0.3]); // persistido no banco
  });

  it('item já cacheado: NÃO chama fetch (cache hit)', async () => {
    await seedItem('Arroz', [1, 0, 0]);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const rows = await loadCatalog(householdId);
    await embedAndCacheCatalog(householdId, rows, KEY_ENV);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('embeda SÓ os itens sem cache (batch parcial)', async () => {
    await seedItem('Arroz', [1, 0, 0]); // já cacheado
    const novo = await seedItem('Feijao'); // sem cache
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [{ values: [0, 1, 0] }] }), // 1 vetor = 1 pendente
    }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const rows = await loadCatalog(householdId);
    await embedAndCacheCatalog(householdId, rows, KEY_ENV);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await readEmbedding(novo)).toEqual([0, 1, 0]);
  });
});

describe('embedAndCacheCatalog — sem GEMINI_API_KEY (degrada, matching fuzzy ok)', () => {
  it('não chama fetch, coluna fica null, matching resolve por fuzzy', async () => {
    await seedItem('Arroz');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const rows = await loadCatalog(householdId);
    const enriched = await embedAndCacheCatalog(householdId, rows, {});

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(enriched[0]!.embedding).toBeNull();

    // Matching ainda casa "ARROZ TP1 5KG" por fuzzy, sem embedding.
    const results = await matchItems(
      [{ descricao: 'ARROZ TP1 5KG CAMIL', quantidade: 1, unidade: 'UN', valorUnitCents: 100, valorTotalCents: 100, ean: null }],
      enriched.map((r) => ({ id: r.id, name: r.name, embedding: r.embedding })),
      {},
    );
    expect(results[0]!.itemId).toBe(enriched[0]!.id);
    expect(results[0]!.method).toBe('fuzzy');
  });
});

describe('invalidateEmbedding — rename zera o cache', () => {
  it('zera items.embedding pra forçar re-embedding no próximo matching', async () => {
    const id = await seedItem('Arroz', [1, 0, 0]);
    await invalidateEmbedding(householdId, id, KEY_ENV);
    expect(await readEmbedding(id)).toBeNull();
  });

  it('sem GEMINI_API_KEY é no-op (nunca houve cache)', async () => {
    const id = await seedItem('Arroz', [1, 0, 0]);
    await invalidateEmbedding(householdId, id, {});
    // Coluna intacta — helper não mexe quando embedding está desligado.
    expect(await readEmbedding(id)).toEqual([1, 0, 0]);
  });
});
