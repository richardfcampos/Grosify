import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initHousehold } from '../sync/engine.js';
import { db, type LocalSessionItem } from './dexie.js';
import { backfillSessionPricesFromNfce, checkSessionItem } from './repositories.js';

// Molde de nfce-confirm.test.ts: fetch mockado (outbox dispara sync fire-and-forget),
// household inicializado, flush pra deixar o loop assíncrono assentar.
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

const NOW = '2026-07-23T00:00:00.000Z';

/** SessionItem cru pendente (não comprado) da casa-teste. */
function pendingSessionItem(): LocalSessionItem {
  return {
    id: 'si-1',
    sessionId: 'sess-1',
    itemId: 'item-arroz',
    actualBrandId: null,
    neededQty: 2,
    estimatedUnitPriceCents: null,
    estimatedPriceStoreId: null,
    checkedAt: null,
    actualQty: null,
    actualUnitPriceCents: null,
    householdId: 'casa-teste',
    updatedAt: NOW,
    deletedAt: null,
    serverVersion: 0,
  } as LocalSessionItem;
}

describe('checkSessionItem — preço opcional', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    vi.stubGlobal('navigator', { onLine: true });
    await initHousehold('casa-teste');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ changes: {}, cursor: 0 }) }),
    );
    await db.sessionItems.add(pendingSessionItem());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('COM preço → marca comprado + grava 1 price_record', async () => {
    await checkSessionItem('si-1', 'item-arroz', 'store-1', 3, 549, null, null);
    await flush();

    const si = await db.sessionItems.get('si-1');
    expect(si!.checkedAt).not.toBeNull();
    expect(si!.actualQty).toBe(3);
    expect(si!.actualUnitPriceCents).toBe(549);

    const prices = await db.prices.toArray();
    expect(prices).toHaveLength(1);
    expect(prices[0]!.priceCents).toBe(549);
  });

  it('SEM preço (null) → marca comprado com qtd/loja, mas NÃO grava price_record', async () => {
    await checkSessionItem('si-1', 'item-arroz', 'store-1', 3, null, null, null);
    await flush();

    const si = await db.sessionItems.get('si-1');
    expect(si!.checkedAt).not.toBeNull(); // comprado
    expect(si!.actualQty).toBe(3); // qtd preservada
    expect(si!.actualUnitPriceCents).toBeNull(); // sem preço (preenche depois)

    // Invariante central: sem preço não existe registro no histórico.
    expect(await db.prices.toArray()).toHaveLength(0);
  });
});

/** Item da sessão comprado (checkedAt) com preço opcional. */
function boughtItem(id: string, itemId: string, priceCents: number | null): LocalSessionItem {
  return { ...pendingSessionItem(), id, itemId, checkedAt: NOW, actualQty: 1, actualUnitPriceCents: priceCents };
}

describe('backfillSessionPricesFromNfce — "usar a nota"', () => {
  beforeEach(async () => {
    await db.sessionItems.clear(); // limpa o si-1 pending do harness externo
  });

  it('preenche só os comprados-SEM-preço que casam por itemId; retorna a contagem', async () => {
    await db.sessionItems.bulkAdd([
      boughtItem('a', 'arroz', null), // comprado sem preço + está na nota → preenche
      boughtItem('b', 'feijao', 890), // já tem preço → não toca
      { ...pendingSessionItem(), id: 'c', itemId: 'arroz', checkedAt: null }, // pendente → não toca
      boughtItem('d', 'cafe', null), // sem preço mas fora da nota → não preenche
    ]);

    const filled = await backfillSessionPricesFromNfce('sess-1', [
      { itemId: 'arroz', priceCents: 549 },
      { itemId: 'leite', priceCents: 400 }, // não está na sessão → ignorado
    ]);

    expect(filled).toBe(1);
    expect((await db.sessionItems.get('a'))!.actualUnitPriceCents).toBe(549);
    expect((await db.sessionItems.get('b'))!.actualUnitPriceCents).toBe(890); // intacto
    expect((await db.sessionItems.get('c'))!.actualUnitPriceCents).toBeNull(); // pendente intacto
    expect((await db.sessionItems.get('d'))!.actualUnitPriceCents).toBeNull(); // sem match

    // Backfill NÃO re-registra no histórico (a confirmação da nota já gravou os preços).
    expect(await db.prices.toArray()).toHaveLength(0);
  });
});
