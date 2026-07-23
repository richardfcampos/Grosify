import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';
import type { NfceLookup, NfceResult } from '../nfce/types.js';

// Banco real (PGlite) no lugar do db/index — molde dos outros testes de rota/quota.
const holder = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock('../db/index.js', () => ({
  get db() {
    return holder.db;
  },
}));

const { startProcessingImport, runScrapeInBackground } = await import(
  '../routes/nfce-import-processor.js'
);
const { setNfceLookup, resetNfceLookup } = await import('../nfce/index.js');

let pg: PGlite;
const db = () => holder.db;

const CHAVE = '43250714200166000166650010000012341123456789';
let HID: string;

function fakeResult(): NfceResult {
  return {
    emitente: { cnpj: '11222333000181', nome: 'Mercado' },
    itens: [{ descricao: 'ARROZ', quantidade: 1, unidade: 'UN', valorUnitCents: 100, valorTotalCents: 100, ean: null }],
    totalCents: 100,
    uf: 'RS',
  };
}
function fakeLookup(over: Partial<NfceLookup> = {}): NfceLookup {
  return { family: 'svrs', fetchItems: vi.fn(async () => fakeResult()), ...over };
}

async function rows() {
  return db().select().from(schema.nfceImports).where(eq(schema.nfceImports.householdId, HID));
}

/** Insere uma linha de import direto (pra montar o estado do gate). */
async function seedRow(status: 'pending' | 'parsed' | 'confirmed' | 'failed', createdAt = new Date()) {
  await db().insert(schema.nfceImports).values({
    id: uuidv7(),
    householdId: HID,
    chave: CHAVE,
    uf: 'RS',
    status,
    itemCount: status === 'failed' ? 0 : 1,
    rawJson: status === 'parsed' || status === 'confirmed' ? fakeResult() : null,
    createdAt,
  });
}

beforeAll(async () => {
  pg = new PGlite();
  holder.db = drizzle(pg, { schema });
  const dir = './drizzle';
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await pg.exec(readFileSync(join(dir, f), 'utf8'));
  }
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(`TRUNCATE nfce_imports, household_members, households, "user" RESTART IDENTITY CASCADE;`);
  const uid = uuidv7();
  await db().insert(schema.user).values({ id: uid, name: 'F', email: `${uid}@x.com`, emailVerified: true });
  HID = uuidv7();
  await db().insert(schema.households).values({ id: HID, name: 'Casa', createdBy: uid, plan: 'pro' });
});

afterEach(() => {
  resetNfceLookup();
  vi.restoreAllMocks();
});

describe('startProcessingImport — gate de decisão', () => {
  it('sem registro → fire (cria pending)', async () => {
    const d = await startProcessingImport(HID, CHAVE, 'RS', { allowRetryFailed: false });
    expect(d).toBe('fire');
    expect((await rows())[0]!.status).toBe('pending');
  });

  it('pending fresco → processing (dedupe entre polls, não re-dispara)', async () => {
    await startProcessingImport(HID, CHAVE, 'RS', { allowRetryFailed: false });
    const d = await startProcessingImport(HID, CHAVE, 'RS', { allowRetryFailed: false });
    expect(d).toBe('processing');
    // Continua uma linha só (upsert por household+chave).
    expect(await rows()).toHaveLength(1);
  });

  it('parsed → cached', async () => {
    await seedRow('parsed');
    expect(await startProcessingImport(HID, CHAVE, 'RS', { allowRetryFailed: false })).toBe('cached');
  });

  it('confirmed → cached', async () => {
    await seedRow('confirmed');
    expect(await startProcessingImport(HID, CHAVE, 'RS', { allowRetryFailed: false })).toBe('cached');
  });

  it('failed + retry=false → failed (poll para, não re-raspa)', async () => {
    await seedRow('failed');
    expect(await startProcessingImport(HID, CHAVE, 'RS', { allowRetryFailed: false })).toBe('failed');
    expect((await rows())[0]!.status).toBe('failed'); // intacto
  });

  it('failed + retry=true → fire (novo scan re-dispara e reseta pra pending)', async () => {
    await seedRow('failed');
    expect(await startProcessingImport(HID, CHAVE, 'RS', { allowRetryFailed: true })).toBe('fire');
    expect((await rows())[0]!.status).toBe('pending');
  });

  it('pending órfão (createdAt > STALE) → fire mesmo sem retry (processo caiu no scrape)', async () => {
    await seedRow('pending', new Date(Date.now() - 4 * 60_000)); // 4min > STALE 3min
    expect(await startProcessingImport(HID, CHAVE, 'RS', { allowRetryFailed: false })).toBe('fire');
  });
});

describe('runScrapeInBackground — resolve o pending', () => {
  it('scrape ok → grava parsed com os itens', async () => {
    await seedRow('pending');
    setNfceLookup(fakeLookup());
    await runScrapeInBackground(HID, CHAVE, 'RS', 'qr-url');
    const [row] = await rows();
    expect(row!.status).toBe('parsed');
    expect(row!.itemCount).toBe(1);
    expect((row!.rawJson as NfceResult).itens).toHaveLength(1);
  });

  it('scrape lança → grava failed (nunca propaga o erro)', async () => {
    await seedRow('pending');
    const { NfceLookupError } = await import('../nfce/index.js');
    setNfceLookup(
      fakeLookup({
        fetchItems: vi.fn(async () => {
          throw new NfceLookupError('nfce_portal_error', 'RS');
        }),
      }),
    );
    await expect(runScrapeInBackground(HID, CHAVE, 'RS', 'qr-url')).resolves.toBeUndefined();
    expect((await rows())[0]!.status).toBe('failed');
  });
});
