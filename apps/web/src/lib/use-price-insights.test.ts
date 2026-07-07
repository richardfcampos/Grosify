import { describe, expect, it } from 'vitest';
import type { LocalPrice } from '../db/dexie.js';
import { buildPriceInsights } from './use-price-insights.js';

const NOW = new Date('2026-07-07T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const STORE = '0197a000-0000-7000-8000-00000000000a';
const BRAND_X = '0197a000-0000-7000-8000-0000000000c1';
const BRAND_Y = '0197a000-0000-7000-8000-0000000000c2';

let seq = 0;

/** Preço vivo a `daysAgo` dias de NOW; marca opcional. */
function price(priceCents: number, daysAgo: number, brandId: string | null = null): LocalPrice {
  const recordedAt = new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString();
  return {
    id: `0197a000-0000-7000-8000-${String(++seq).padStart(12, '0')}`,
    householdId: 'casa-teste',
    itemId: 'item-teste',
    brandId,
    storeId: STORE,
    priceCents,
    recordedAt,
    source: 'manual',
    rating: null,
    updatedAt: recordedAt,
    deletedAt: null,
    serverVersion: seq,
  };
}

// dados ricos: veredito buy (X caindo 1200→1100→1000) + troca de marca com 20% (X 1000 vs Y 800)
const RICH: LocalPrice[] = [
  price(1200, 30, BRAND_X),
  price(1100, 20, BRAND_X),
  price(1000, 5, BRAND_X),
  price(800, 4, BRAND_Y),
];

describe('buildPriceInsights — gate Pro-only (invariante de privacidade)', () => {
  it('free retorna ambos null mesmo com dados ricos — nada é computado', () => {
    const out = buildPriceInsights('free', RICH, NOW);
    expect(out.verdict).toBeNull();
    expect(out.swap).toBeNull();
  });

  it('pro computa os dois insights com os MESMOS dados (prova que o null do free é o gate)', () => {
    const out = buildPriceInsights('pro', RICH, NOW);
    expect(out.verdict?.verdict).toBe('buy');
    expect(out.swap?.savingsPct).toBe(20);
  });
});
