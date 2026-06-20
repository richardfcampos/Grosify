import { describe, expect, it } from 'vitest';
import type { PriceRecord } from '../schemas/index.js';
import {
  averagePrice,
  baseUnitFor,
  budgetStatus,
  cheapestStore,
  convertUnit,
  estimateTotal,
  formatBRL,
  isRecurrenceDue,
  latestPriceByStoreBrand,
  neededQty,
  parsePriceTag,
  priceChange,
} from './index.js';

const HOUSEHOLD = '0197a000-0000-7000-8000-000000000001';
const ITEM = '0197a000-0000-7000-8000-000000000002';
const STORE_A = '0197a000-0000-7000-8000-00000000000a';
const STORE_B = '0197a000-0000-7000-8000-00000000000b';
const BRAND_X = '0197a000-0000-7000-8000-0000000000c1';
const BRAND_Y = '0197a000-0000-7000-8000-0000000000c2';

let seq = 0;

function record(partial: Partial<PriceRecord> & Pick<PriceRecord, 'storeId' | 'priceCents' | 'recordedAt'>): PriceRecord {
  return {
    id: `0197a000-0000-7000-8000-${String(++seq).padStart(12, '0')}`,
    householdId: HOUSEHOLD,
    itemId: ITEM,
    brandId: null,
    source: 'manual',
    rating: null,
    updatedAt: partial.recordedAt,
    deletedAt: null,
    serverVersion: seq,
    ...partial,
  };
}

describe('averagePrice', () => {
  const records = [
    record({ storeId: STORE_A, priceCents: 1000, recordedAt: '2026-01-01T10:00:00.000Z' }),
    record({ storeId: STORE_B, priceCents: 2000, recordedAt: '2026-03-01T10:00:00.000Z' }),
    record({ storeId: STORE_A, priceCents: 3000, recordedAt: '2026-06-01T10:00:00.000Z' }),
  ];

  it('média de todos os registros desde a data', () => {
    expect(averagePrice(records, '2026-01-01T00:00:00.000Z')).toBe(2000);
  });
  it('filtra por janela de data', () => {
    expect(averagePrice(records, '2026-04-01T00:00:00.000Z')).toBe(3000);
  });
  it('ignora apagados e retorna null sem registros', () => {
    expect(averagePrice([], '2026-01-01T00:00:00.000Z')).toBeNull();
  });
});

describe('convertUnit / baseUnitFor', () => {
  it('converte g↔kg e ml↔L', () => {
    expect(convertUnit(1500, 'g', 'kg')).toBe(1.5);
    expect(convertUnit(2, 'kg', 'g')).toBe(2000);
    expect(convertUnit(500, 'ml', 'l')).toBe(0.5);
    expect(convertUnit(1, 'l', 'ml')).toBe(1000);
  });
  it('mesma unidade é identidade; incompatível é null', () => {
    expect(convertUnit(5, 'kg', 'kg')).toBe(5);
    expect(convertUnit(5, 'kg', 'l')).toBeNull();
    expect(convertUnit(5, 'un', 'kg')).toBeNull();
  });
  it('baseUnitFor mapeia g→kg, ml→l, resto null', () => {
    expect(baseUnitFor('g')).toBe('kg');
    expect(baseUnitFor('ml')).toBe('l');
    expect(baseUnitFor('un')).toBeNull();
    expect(baseUnitFor('kg')).toBeNull();
  });
});

describe('budgetStatus', () => {
  it('null sem orçamento', () => {
    expect(budgetStatus(100, null)).toBeNull();
    expect(budgetStatus(100, 0)).toBeNull();
  });
  it('ok abaixo de 80%, warn em 80-99%, over em 100%+', () => {
    expect(budgetStatus(50, 100)?.level).toBe('ok');
    expect(budgetStatus(80, 100)?.level).toBe('warn');
    expect(budgetStatus(99, 100)?.level).toBe('warn');
    expect(budgetStatus(100, 100)?.level).toBe('over');
    expect(budgetStatus(120, 100)?.pct).toBe(120);
  });
});

describe('isRecurrenceDue', () => {
  it('mensal vence no dia do mês', () => {
    expect(isRecurrenceDue('monthly', 15, new Date(2026, 5, 15))).toBe(true);
    expect(isRecurrenceDue('monthly', 15, new Date(2026, 5, 14))).toBe(false);
  });
  it('semanal vence no dia da semana', () => {
    // 2026-06-15 é segunda-feira (getDay()===1)
    expect(isRecurrenceDue('weekly', 1, new Date(2026, 5, 15))).toBe(true);
    expect(isRecurrenceDue('weekly', 2, new Date(2026, 5, 15))).toBe(false);
  });
  it('null/sem dia nunca vence', () => {
    expect(isRecurrenceDue(null, 1, new Date(2026, 5, 15))).toBe(false);
    expect(isRecurrenceDue('monthly', null, new Date(2026, 5, 15))).toBe(false);
  });
});

describe('parsePriceTag', () => {
  it('lê valor com decimais (vírgula ou ponto)', () => {
    expect(parsePriceTag('R$ 12,90')).toBe('12,90');
    expect(parsePriceTag('Preço 8.49 kg')).toBe('8.49');
  });
  it('pega o primeiro candidato quando há vários', () => {
    expect(parsePriceTag('de 19,90 por 12,90')).toBe('19,90');
  });
  it('cai pra inteiro quando não há decimais', () => {
    expect(parsePriceTag('arroz 5 kg')).toBe('5');
  });
  it('null quando não há número', () => {
    expect(parsePriceTag('promoção')).toBeNull();
  });
});

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

  it('pega o último preço de cada loja (marca null)', () => {
    const latest = latestPriceByStoreBrand(records);
    expect(latest.get(`${STORE_A}|`)?.priceCents).toBe(1200);
    expect(latest.get(`${STORE_B}|`)?.priceCents).toBe(1100);
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
    const change = priceChange(1250, STORE_A, null, records);
    expect(change).toEqual({
      previousPriceCents: 1000,
      previousRecordedAt: '2026-01-01T10:00:00.000Z',
      deltaCents: 250,
      deltaPct: 25,
    });
  });

  it('detecta queda', () => {
    expect(priceChange(900, STORE_A, null, records)?.deltaCents).toBe(-100);
  });

  it('null sem histórico na loja', () => {
    expect(priceChange(1000, STORE_B, null, records)).toBeNull();
  });

  it('compara por marca: aumento só conta na mesma marca', () => {
    const recs = [
      record({ storeId: STORE_A, brandId: BRAND_X, priceCents: 1000, recordedAt: '2026-01-01T10:00:00.000Z' }),
    ];
    expect(priceChange(1200, STORE_A, BRAND_X, recs)?.deltaCents).toBe(200);
    // marca diferente na mesma loja → sem histórico
    expect(priceChange(1200, STORE_A, BRAND_Y, recs)).toBeNull();
  });
});

describe('cheapestStore por marca', () => {
  it('cruza marcas e retorna a marca+loja mais barata', () => {
    const recs = [
      record({ storeId: STORE_A, brandId: BRAND_X, priceCents: 1000, recordedAt: '2026-01-01T10:00:00.000Z' }),
      record({ storeId: STORE_A, brandId: BRAND_Y, priceCents: 800, recordedAt: '2026-01-02T10:00:00.000Z' }),
      record({ storeId: STORE_B, brandId: BRAND_X, priceCents: 900, recordedAt: '2026-01-03T10:00:00.000Z' }),
    ];
    const c = cheapestStore(recs);
    expect(c?.priceCents).toBe(800);
    expect(c?.brandId).toBe(BRAND_Y);
    expect(c?.storeId).toBe(STORE_A);
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
