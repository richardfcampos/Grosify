import { describe, expect, it } from 'vitest';
import type { LocalMovement } from '../db/dexie.js';
import { buildForecastMap } from './use-replenishment-forecast.js';

const NOW = new Date('2026-07-06T12:00:00Z');

/** Movimento de consumo válido dentro da janela (qty negativa, tipo consumption). */
function consumption(itemId: string, daysAgo: number, qty = -1): LocalMovement {
  const movedAt = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: `mov-${itemId}-${daysAgo}`,
    householdId: 'casa-teste',
    itemId,
    type: 'consumption',
    qty,
    balanceAfter: 10,
    reason: null,
    movedAt,
    updatedAt: movedAt,
    deletedAt: null,
    serverVersion: 0,
  } as LocalMovement;
}

const RICH_MOVEMENTS = [consumption('arroz', 2), consumption('arroz', 10), consumption('arroz', 20)];
const INVENTORY = [{ itemId: 'arroz', qtyOnHand: 5 }];

describe('buildForecastMap — gate Pro-only (invariante de privacidade)', () => {
  it('free retorna Map VAZIO mesmo com dados ricos — o número nem é computado', () => {
    const map = buildForecastMap('free', RICH_MOVEMENTS, INVENTORY, NOW);
    expect(map.size).toBe(0);
  });

  it('pro computa a previsão com os MESMOS dados (prova que o vazio do free é o gate)', () => {
    const map = buildForecastMap('pro', RICH_MOVEMENTS, INVENTORY, NOW);
    expect(map.get('arroz')).toBeTypeOf('number');
    expect(map.get('arroz')!).toBeGreaterThan(0);
  });
});
