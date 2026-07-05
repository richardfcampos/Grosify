import {
  applyFreeCaps,
  FREE_MAX_ITEMS,
  FREE_MAX_LISTS,
  FREE_MAX_MEMBERS,
  maxItems,
  maxLists,
  maxMembers,
  PLAN_PRICES,
} from '@grosify/shared';
import { describe, expect, it } from 'vitest';

describe('plans — tetos por plano', () => {
  it('maxItems: free=30, pro=ilimitado', () => {
    expect(maxItems('free')).toBe(FREE_MAX_ITEMS);
    expect(maxItems('free')).toBe(30);
    expect(maxItems('pro')).toBe(Number.POSITIVE_INFINITY);
  });

  it('maxLists: free=2, pro=ilimitado', () => {
    expect(maxLists('free')).toBe(FREE_MAX_LISTS);
    expect(maxLists('free')).toBe(2);
    expect(maxLists('pro')).toBe(Number.POSITIVE_INFINITY);
  });

  it('maxMembers: free=2, pro=ilimitado', () => {
    expect(maxMembers('free')).toBe(FREE_MAX_MEMBERS);
    expect(maxMembers('free')).toBe(2);
    expect(maxMembers('pro')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('PLAN_PRICES', () => {
  it('BRL: mensal 1290, anual 9900', () => {
    expect(PLAN_PRICES.BRL.monthly).toBe(1290);
    expect(PLAN_PRICES.BRL.yearly).toBe(9900);
  });

  it('USD: mensal 399, anual 2900', () => {
    expect(PLAN_PRICES.USD.monthly).toBe(399);
    expect(PLAN_PRICES.USD.yearly).toBe(2900);
  });
});

describe('applyFreeCaps', () => {
  // ids fora de ordem cronológica de propósito — deve reordenar por id asc antes do slice
  const rows = [{ id: 'c' }, { id: 'a' }, { id: 'b' }, { id: 'd' }];

  it('pro: retorna tudo, sem reordenar nem cortar', () => {
    expect(applyFreeCaps(rows, 2, 'pro')).toEqual(rows);
  });

  it('free: ordena por id asc e corta no cap', () => {
    expect(applyFreeCaps(rows, 2, 'free')).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('free: cap maior que o total retorna tudo ordenado', () => {
    expect(applyFreeCaps(rows, 10, 'free')).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
    ]);
  });

  it('free: cap zero retorna vazio', () => {
    expect(applyFreeCaps(rows, 0, 'free')).toEqual([]);
  });

  it('não muta o array original (pure)', () => {
    const original = [{ id: 'z' }, { id: 'a' }];
    const copy = [...original];
    applyFreeCaps(original, 1, 'free');
    expect(original).toEqual(copy);
  });
});
