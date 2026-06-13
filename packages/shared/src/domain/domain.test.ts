import { describe, expect, it } from 'vitest';
import type { PriceRecord } from '../schemas/index.js';
import {
  cheapestStore,
  estimateTotal,
  formatBRL,
  latestPriceByStore,
  neededQty,
  priceChange,
} from './index.js';

const HOUSEHOLD = '0197a000-0000-7000-8000-000000000001';
const ITEM = '0197a000-0000-7000-8000-000000000002';
const STORE_A = '0197a000-0000-7000-8000-00000000000a';
const STORE_B = '0197a000-0000-7000-8000-00000000000b';

let seq = 0;

function record(partial: Partial<PriceRecord> & Pick<PriceRecord, 'storeId' | 'priceCents' | 'recordedAt'>): PriceRecord {
  return {
    id: `0197a000-0000-7000-8000-${String(++seq).padStart(12, '0')}`,
    householdId: HOUSEHOLD,
    itemId: ITEM,
    source: 'manual',
    updatedAt: partial.recordedAt,
    deletedAt: null,
    serverVersion: seq,
    ...partial,
  };
}

describe('neededQty', () => {
  it('subtrai estoque do padrão mensal', () => {
    expect(neededQty(5, 2)).toBe(3);
  });
  it('nunca retorna negativo', () => {
    expect(neededQty(2, 5)).toBe(0);
  });
  it('lida com decimais sem erro de float', () => {
    expect(neededQty(1.5, 0.3)).toBe(1.2);
  });
});

describe('latestPriceByStore / cheapestStore', () => {
  const records = [
    record({ storeId: STORE_A, priceCents: 1000, recordedAt: '2026-01-01T10:00:00.000Z' }),
    record({ storeId: STORE_A, priceCents: 1200, recordedAt: '2026-03-01T10:00:00.000Z' }),
    record({ storeId: STORE_B, priceCents: 1100, recordedAt: '2026-02-01T10:00:00.000Z' }),
  ];

  it('pega o último preço de cada loja', () => {
    const latest = latestPriceByStore(records);
    expect(latest.get(STORE_A)?.priceCents).toBe(1200);
    expect(latest.get(STORE_B)?.priceCents).toBe(1100);
  });

  it('loja mais barata usa último preço, não menor histórico', () => {
    // A já foi 1000, mas hoje está 1200; B está 1100 → B é a mais barata
    expect(cheapestStore(records)?.storeId).toBe(STORE_B);
  });

  it('ignora tombstones', () => {
    const withDeleted = [
      ...records,
      record({
        storeId: STORE_B,
        priceCents: 500,
        recordedAt: '2026-04-01T10:00:00.000Z',
        deletedAt: '2026-04-02T10:00:00.000Z',
      }),
    ];
    expect(cheapestStore(withDeleted)?.priceCents).toBe(1100);
  });

  it('retorna null sem registros', () => {
    expect(cheapestStore([])).toBeNull();
  });
});

describe('priceChange', () => {
  const records = [
    record({ storeId: STORE_A, priceCents: 1000, recordedAt: '2026-01-01T10:00:00.000Z' }),
  ];

  it('detecta aumento com percentual', () => {
    const change = priceChange(1250, STORE_A, records);
    expect(change).toEqual({
      previousPriceCents: 1000,
      previousRecordedAt: '2026-01-01T10:00:00.000Z',
      deltaCents: 250,
      deltaPct: 25,
    });
  });

  it('detecta queda', () => {
    expect(priceChange(900, STORE_A, records)?.deltaCents).toBe(-100);
  });

  it('null sem histórico na loja', () => {
    expect(priceChange(1000, STORE_B, records)).toBeNull();
  });
});

describe('estimateTotal', () => {
  it('soma qty × preço e conta linhas sem preço', () => {
    const result = estimateTotal([
      { qty: 2, unitPriceCents: 500 },
      { qty: 1.5, unitPriceCents: 1000 },
      { qty: 3, unitPriceCents: null },
    ]);
    expect(result).toEqual({ totalCents: 2500, pricedLines: 2, missingPriceLines: 1 });
  });
});

describe('formatBRL', () => {
  it('formata centavos em pt-BR', () => {
    expect(formatBRL(123456).replace(/ /g, ' ')).toBe('R$ 1.234,56');
  });
});
