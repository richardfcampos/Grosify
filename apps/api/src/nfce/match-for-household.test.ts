import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';
// Type-only (erased em runtime; gemini-generate não puxa db) — seguro no topo.
import type { GeneratedLine } from './gemini-generate.js';

/**
 * Testes do adaptador + matching por casa (NL-01/NL-02). O adaptador é puro; o
 * `matchLinesForHousehold` toca o banco (via embed-cache) → PGlite por arquivo, mesmo
 * molde de nfce-embedding-cache.test. Sem `GEMINI_API_KEY` no ambiente do teste, o
 * matching roda só fuzzy (não chama rede) — prova que o pipeline funciona degradado.
 */

const holder = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock('../db/index.js', () => ({
  get db() {
    return holder.db;
  },
}));

// importa DEPOIS do mock (match-for-household puxa embed-cache que usa db/index)
const { generatedToNfceItem, matchLinesForHousehold, normalizeUnit } = await import('./match-for-household.js');

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

async function seedItem(name: string): Promise<string> {
  const id = uuidv7();
  await db().insert(schema.items).values({ id, householdId, name });
  return id;
}

describe('generatedToNfceItem — adaptador (linha gerada → NfceItem)', () => {
  it('monta NfceItem com preço 0, EAN null e unidade normalizada', () => {
    const item = generatedToNfceItem({ name: 'Arroz', qty: 2, unit: 'Kg' });
    expect(item).toEqual({
      descricao: 'Arroz',
      quantidade: 2,
      unidade: 'kg',
      valorUnitCents: 0,
      valorTotalCents: 0,
      ean: null,
    });
  });
});

describe('normalizeUnit — string do modelo → enum Unit (default un)', () => {
  it('mapeia aliases comuns pt/en pro enum', () => {
    expect(normalizeUnit('un')).toBe('un');
    expect(normalizeUnit('Unidade')).toBe('un');
    expect(normalizeUnit('pct')).toBe('un');
    expect(normalizeUnit('cx')).toBe('un');
    expect(normalizeUnit('dz')).toBe('un');
    expect(normalizeUnit('KG')).toBe('kg');
    expect(normalizeUnit('quilos')).toBe('kg');
    expect(normalizeUnit('g')).toBe('g');
    expect(normalizeUnit('gramas')).toBe('g');
    expect(normalizeUnit('L')).toBe('l');
    expect(normalizeUnit('litros')).toBe('l');
    expect(normalizeUnit('ml')).toBe('ml');
  });

  it('unidade não-canônica / vazia → default "un" (edge case do spec)', () => {
    expect(normalizeUnit('xícara')).toBe('un');
    expect(normalizeUnit('')).toBe('un');
    expect(normalizeUnit('un.')).toBe('un'); // ponto de abreviação tolerado
  });
});

describe('matchLinesForHousehold — casa/novo por linha (fuzzy, sem chave)', () => {
  it('linha que casa o catálogo → itemId; linha nova → null', async () => {
    const arrozId = await seedItem('Arroz');
    await seedItem('Feijão');

    const lines: GeneratedLine[] = [
      { name: 'Arroz', qty: 2, unit: 'kg' }, // casa
      { name: 'Guardanapo', qty: 1, unit: 'un' }, // novo (não está no catálogo)
    ];
    const results = await matchLinesForHousehold(householdId, lines.map(generatedToNfceItem));

    expect(results[0]!.itemId).toBe(arrozId);
    expect(results[1]!.itemId).toBeNull();
    expect(results[1]!.suggestedName).toBe('Guardanapo');
  });

  it('catálogo vazio → todas as linhas "novo"', async () => {
    const lines: GeneratedLine[] = [
      { name: 'Arroz', qty: 1, unit: 'kg' },
      { name: 'Cerveja', qty: 12, unit: 'un' },
    ];
    const results = await matchLinesForHousehold(householdId, lines.map(generatedToNfceItem));

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.itemId === null)).toBe(true);
  });
});
