import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initHousehold } from '../sync/engine.js';
import { db } from './dexie.js';
import { confirmNfceReview, type ConfirmNfceReviewInput } from './nfce-confirm.js';

// Molde de plan-gates.test.ts: fetch mockado (outbox dispara syncNow fire-and-forget),
// household inicializado, flush pra deixar o loop assíncrono assentar antes de inspecionar.
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

const EMITENTE = { cnpj: '11222333000181', nome: 'Mercado Teste' };

function rawItem(overrides: Partial<ConfirmNfceReviewInput['lines'][number]['raw']> = {}) {
  return {
    descricao: 'ARROZ TP1 5KG CAMIL',
    quantidade: 1,
    unidade: 'UN',
    valorUnitCents: 2990,
    valorTotalCents: 2990,
    ean: null as string | null,
    ...overrides,
  };
}

describe('confirmNfceReview — NFCE-06 AC3', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    vi.stubGlobal('navigator', { onLine: true });
    await initHousehold('casa-teste');
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ changes: {}, cursor: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('linha matcheada (itemId existente) → 1 price_record source=import, sem criar item', async () => {
    const item = await db.items.add({
      id: 'item-arroz',
      householdId: 'casa-teste',
      name: 'Arroz',
      category: null,
      categoryId: null,
      notes: null,
      minStock: null,
      photoKey: null,
      unit: 'un',
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      serverVersion: 0,
      photoBlob: null,
    });

    await confirmNfceReview({
      chave: '43250714200166000166650010000012341123456789',
      emitente: EMITENTE,
      store: { storeId: null, createName: 'Mercado Teste' },
      lines: [
        {
          lineIndex: 0,
          raw: rawItem(),
          itemId: item as string,
          newItemName: '',
          ignored: false,
          priceCents: 2990,
          qty: 1,
        },
      ],
    });
    await flush();

    const prices = await db.prices.toArray();
    expect(prices).toHaveLength(1);
    expect(prices[0]!.source).toBe('import');
    expect(prices[0]!.itemId).toBe('item-arroz');
    expect(prices[0]!.priceCents).toBe(2990);

    const items = await db.items.toArray();
    expect(items).toHaveLength(1); // nenhum item novo criado
  });

  it('linha "novo" → cria item + barcode (EAN) ANTES do preço', async () => {
    await confirmNfceReview({
      chave: '43250714200166000166650010000012341123456789',
      emitente: EMITENTE,
      store: { storeId: null, createName: 'Mercado Teste' },
      lines: [
        {
          lineIndex: 0,
          raw: rawItem({ ean: '7896006711221' }),
          itemId: null,
          newItemName: 'Arroz Camil',
          ignored: false,
          priceCents: 2990,
          qty: 1,
        },
      ],
    });
    await flush();

    const items = await db.items.toArray();
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Arroz Camil');

    const barcodes = await db.barcodes.where('itemId').equals(items[0]!.id).toArray();
    expect(barcodes).toHaveLength(1);
    expect(barcodes[0]!.barcode).toBe('7896006711221');

    const prices = await db.prices.toArray();
    expect(prices).toHaveLength(1);
    expect(prices[0]!.itemId).toBe(items[0]!.id);
    expect(prices[0]!.source).toBe('import');
  });

  it('linha "novo" sem EAN → cria item sem barcode', async () => {
    await confirmNfceReview({
      chave: '43250714200166000166650010000012341123456789',
      emitente: EMITENTE,
      store: { storeId: null, createName: 'Mercado Teste' },
      lines: [
        {
          lineIndex: 0,
          raw: rawItem({ ean: null }),
          itemId: null,
          newItemName: 'Feijão Preto',
          ignored: false,
          priceCents: 890,
          qty: 2,
        },
      ],
    });
    await flush();

    const barcodes = await db.barcodes.toArray();
    expect(barcodes).toHaveLength(0);
  });

  it('linha ignorada não grava (caller já filtra antes de chamar)', async () => {
    // O caller (nfce-review.tsx) filtra `lines.filter(l => !l.ignored)` antes de
    // chamar confirmNfceReview — aqui garantimos que só o que foi passado é gravado.
    await confirmNfceReview({
      chave: '43250714200166000166650010000012341123456789',
      emitente: EMITENTE,
      store: { storeId: null, createName: 'Mercado Teste' },
      lines: [],
    });
    await flush();

    expect(await db.prices.count()).toBe(0);
    expect(await db.items.count()).toBe(0);
  });

  it('loja resolvida por CNPJ (storeId já vindo do passo de loja) é reusada — não cria loja nova', async () => {
    const existingStoreId = await db.stores.add({
      id: 'store-existente',
      householdId: 'casa-teste',
      name: 'Mercado Teste',
      city: null,
      neighborhood: null,
      lat: null,
      lng: null,
      cnpj: EMITENTE.cnpj,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      serverVersion: 0,
    });

    await confirmNfceReview({
      chave: '43250714200166000166650010000012341123456789',
      emitente: EMITENTE,
      store: { storeId: existingStoreId as string, createName: null },
      lines: [
        {
          lineIndex: 0,
          raw: rawItem(),
          itemId: null,
          newItemName: 'Arroz Camil',
          ignored: false,
          priceCents: 2990,
          qty: 1,
        },
      ],
    });
    await flush();

    const stores = await db.stores.toArray();
    expect(stores).toHaveLength(1); // nenhuma loja nova criada

    const prices = await db.prices.toArray();
    expect(prices[0]!.storeId).toBe('store-existente');
  });

  it('loja nova (sem match por CNPJ) é criada com o cnpj do emitente', async () => {
    await confirmNfceReview({
      chave: '43250714200166000166650010000012341123456789',
      emitente: EMITENTE,
      store: { storeId: null, createName: 'Mercado Teste' },
      lines: [
        {
          lineIndex: 0,
          raw: rawItem(),
          itemId: null,
          newItemName: 'Arroz Camil',
          ignored: false,
          priceCents: 2990,
          qty: 1,
        },
      ],
    });
    await flush();

    const stores = await db.stores.toArray();
    expect(stores).toHaveLength(1);
    expect(stores[0]!.cnpj).toBe(EMITENTE.cnpj);
    expect(stores[0]!.name).toBe('Mercado Teste');
  });
});
