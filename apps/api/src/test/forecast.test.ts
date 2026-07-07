import {
  dailyConsumptionRate,
  daysUntilOut,
  FORECAST_WINDOW_DAYS,
  type MovementType,
  type StockMovement,
} from '@grosify/shared';
import { describe, expect, it } from 'vitest';

const HOUSEHOLD = '0197a000-0000-7000-8000-000000000001';
const ITEM = '0197a000-0000-7000-8000-000000000002';

// "agora" fixo pros testes serem determinísticos
const NOW = new Date('2026-07-07T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

let seq = 0;

/** Movimento a `daysAgo` dias de NOW. qty já com sinal (consumo negativo). */
function mov(type: MovementType, qty: number, daysAgo: number): StockMovement {
  const movedAt = new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString();
  return {
    id: `0197a000-0000-7000-8000-${String(++seq).padStart(12, '0')}`,
    householdId: HOUSEHOLD,
    itemId: ITEM,
    type,
    qty,
    balanceAfter: 0,
    reason: null,
    movedAt,
    updatedAt: movedAt,
    deletedAt: null,
    serverVersion: seq,
  };
}

describe('dailyConsumptionRate', () => {
  // S3/AC2 + S1/AC1: soma consumo na janela e divide pela janela inteira
  it('soma -qty dos consumos na janela / windowDays', () => {
    const movements = [
      mov('consumption', -3, 10),
      mov('consumption', -3, 30),
    ];
    // total consumido = 6 em 60 dias → 0.1/dia
    expect(dailyConsumptionRate(movements, FORECAST_WINDOW_DAYS, NOW)).toBeCloseTo(0.1);
  });

  // S3/AC1: só conta type=consumption
  it('ignora purchase/adjustment/count', () => {
    const movements = [
      mov('consumption', -2, 5),
      mov('consumption', -2, 15),
      mov('purchase', 10, 3),
      mov('adjustment', 5, 8),
      mov('count', 4, 1),
    ];
    // só os dois consumos (4 no total) contam → 4/60
    expect(dailyConsumptionRate(movements, 60, NOW)).toBeCloseTo(4 / 60);
  });

  // S3/AC2 + S1/AC2: mínimo de 2 eventos
  it('null com menos de 2 eventos de consumo (item novo/esporádico)', () => {
    expect(dailyConsumptionRate([], 60, NOW)).toBeNull();
    expect(dailyConsumptionRate([mov('consumption', -5, 3)], 60, NOW)).toBeNull();
  });

  // S1/AC5 + S3/AC1: eventos fora da janela são ignorados
  it('ignora consumos fora da janela de 60d', () => {
    const movements = [
      mov('consumption', -3, 10),
      mov('consumption', -3, 90), // fora da janela
    ];
    // sobra só 1 evento dentro da janela → abaixo do mínimo → null
    expect(dailyConsumptionRate(movements, 60, NOW)).toBeNull();
  });

  // S1/AC4: sem consumo (só outros tipos) → taxa é null (abaixo do mínimo)
  it('null quando não há consumo, só compras/contagens', () => {
    const movements = [mov('purchase', 10, 3), mov('count', 8, 1)];
    expect(dailyConsumptionRate(movements, 60, NOW)).toBeNull();
  });
});

describe('daysUntilOut', () => {
  // S1/AC1 + S3/AC3: floor(qtyOnHand / rate)
  it('floor(qtyOnHand / rate)', () => {
    expect(daysUntilOut(10, 2)).toBe(5); // 10/2 = 5
    expect(daysUntilOut(11, 2)).toBe(5); // 11/2 = 5.5 → 5 (conservador)
    expect(daysUntilOut(1, 0.2)).toBe(5); // 1/0.2 = 5
  });

  // S3/AC3: rate null → null
  it('null quando rate é null', () => {
    expect(daysUntilOut(10, null)).toBeNull();
  });

  // S1/AC4 + S3/AC3: taxa não-positiva → null
  it('null quando rate <= 0', () => {
    expect(daysUntilOut(10, 0)).toBeNull();
    expect(daysUntilOut(10, -1)).toBeNull();
  });

  // S1/AC3 + S3/AC3: estoque zerado/negativo → null
  it('null quando qtyOnHand <= 0', () => {
    expect(daysUntilOut(0, 1)).toBeNull();
    expect(daysUntilOut(-3, 1)).toBeNull();
  });
});

describe('forecast — fluxo ponta a ponta (S1/AC6)', () => {
  it('item com consumo suficiente e estoque baixo dá poucos dias', () => {
    const movements = [
      mov('consumption', -30, 10),
      mov('consumption', -30, 40),
    ];
    // 60 consumidos em 60d → 1/dia; estoque 3 → acaba em ~3 dias
    const rate = dailyConsumptionRate(movements, 60, NOW);
    expect(daysUntilOut(3, rate)).toBe(3);
  });
});
