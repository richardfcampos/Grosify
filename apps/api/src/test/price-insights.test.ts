import {
  buyOrWaitVerdict,
  cheaperBrandSwap,
  INSIGHTS_WINDOW_DAYS,
  type PriceRecord,
} from '@grosify/shared';
import { describe, expect, it } from 'vitest';

const HOUSEHOLD = '0197a000-0000-7000-8000-000000000001';
const ITEM = '0197a000-0000-7000-8000-000000000002';
const STORE_A = '0197a000-0000-7000-8000-00000000000a';
const STORE_B = '0197a000-0000-7000-8000-00000000000b';
const BRAND_X = '0197a000-0000-7000-8000-0000000000c1';
const BRAND_Y = '0197a000-0000-7000-8000-0000000000c2';

// "agora" fixo pros testes serem determinísticos
const NOW = new Date('2026-07-07T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

let seq = 0;

/** Registro de preço a `daysAgo` dias de NOW; brandId opcional. */
function rec(
  priceCents: number,
  daysAgo: number,
  opts: { storeId?: string; brandId?: string | null; deletedAt?: string | null } = {},
): PriceRecord {
  const recordedAt = new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString();
  return {
    id: `0197a000-0000-7000-8000-${String(++seq).padStart(12, '0')}`,
    householdId: HOUSEHOLD,
    itemId: ITEM,
    brandId: opts.brandId ?? null,
    storeId: opts.storeId ?? STORE_A,
    priceCents,
    recordedAt,
    source: 'manual',
    rating: null,
    updatedAt: recordedAt,
    deletedAt: opts.deletedAt ?? null,
    serverVersion: seq,
  };
}

describe('buyOrWaitVerdict (S1)', () => {
  // S1/AC1: gate de privacidade — free não computa
  it('free retorna null sem computar (gate Pro-only)', () => {
    const records = [rec(1000, 30), rec(900, 20), rec(800, 10)];
    expect(buyOrWaitVerdict('free', records, NOW)).toBeNull();
  });

  // S1/AC2: menos de 3 registros na janela → null
  it('null com menos de 3 registros na janela', () => {
    expect(buyOrWaitVerdict('pro', [rec(1000, 10), rec(1100, 5)], NOW)).toBeNull();
  });

  // S1/AC3: atual ≤ média·0,97 → buy
  it('buy quando atual está abaixo da média (≤ média·0,97)', () => {
    // média = 1000; atual 900 ≤ 970 → buy
    const records = [rec(1100, 30), rec(1000, 20), rec(900, 5)];
    expect(buyOrWaitVerdict('pro', records, NOW)?.verdict).toBe('buy');
  });

  // S1/AC4: 3 últimos estritamente caindo → buy mesmo sem estar abaixo da média
  it('buy quando os 3 últimos caem estritamente (mesmo acima da média)', () => {
    // média baixada por um registro antigo; atual ainda acima da média, mas caindo
    const records = [rec(500, 80), rec(1300, 20), rec(1200, 10), rec(1100, 2)];
    const out = buyOrWaitVerdict('pro', records, NOW);
    expect(out?.verdict).toBe('buy');
    expect(out!.currentCents).toBeGreaterThan(out!.avgCents); // acima da média, ainda assim buy
  });

  // S1/AC5: atual ≥ média·1,05 E os 2 últimos subindo → wait
  it('wait quando atual está caro (≥ média·1,05) e subindo', () => {
    // média = 1000; atual 1200 ≥ 1050 e último par sobe (1100→1200)
    const records = [rec(700, 30), rec(1100, 20), rec(1200, 5)];
    expect(buyOrWaitVerdict('pro', records, NOW)?.verdict).toBe('wait');
  });

  // S1/AC6: sem sinal claro → neutral
  it('neutral quando não há sinal claro', () => {
    // atual = média, sem tendência estrita
    const records = [rec(1000, 30), rec(1010, 20), rec(1000, 5)];
    expect(buyOrWaitVerdict('pro', records, NOW)?.verdict).toBe('neutral');
  });

  // S1/AC7: buy tem precedência sobre wait quando colidem
  it('buy vence wait quando ambos batem (caro mas caindo)', () => {
    // atual acima da média (wait-ish) mas os 3 últimos caindo (buy)
    const records = [rec(600, 85), rec(1400, 20), rec(1300, 10), rec(1200, 2)];
    expect(buyOrWaitVerdict('pro', records, NOW)?.verdict).toBe('buy');
  });

  // Edge: 1 registro só → null
  it('null com 1 registro só', () => {
    expect(buyOrWaitVerdict('pro', [rec(1000, 5)], NOW)).toBeNull();
  });

  // Edge: preços velhos fora da janela não contam
  it('ignora registros fora da janela de 90d (sobram <3 → null)', () => {
    const old = INSIGHTS_WINDOW_DAYS + 10;
    const records = [rec(1000, old), rec(900, old + 5), rec(800, 10)];
    expect(buyOrWaitVerdict('pro', records, NOW)).toBeNull();
  });

  // Edge: registros apagados são ignorados
  it('ignora registros apagados', () => {
    const records = [
      rec(1000, 30),
      rec(900, 20),
      rec(800, 10, { deletedAt: NOW.toISOString() }),
    ];
    expect(buyOrWaitVerdict('pro', records, NOW)).toBeNull(); // sobram 2 vivos
  });
});

describe('cheaperBrandSwap (S2)', () => {
  // S2/AC1: gate de privacidade — free não computa
  it('free retorna null sem computar (gate Pro-only)', () => {
    const records = [
      rec(1000, 10, { storeId: STORE_A, brandId: BRAND_X }),
      rec(800, 5, { storeId: STORE_A, brandId: BRAND_Y }),
    ];
    expect(cheaperBrandSwap('free', records, NOW)).toBeNull();
  });

  // S2/AC2 + AC3: 2 marcas na mesma loja, economia ≥ 10% → sugere par
  it('sugere troca quando marca mais barata é ≥10% mais barata na mesma loja', () => {
    // BRAND_X 1000 vs BRAND_Y 800 na STORE_A → economia 20%
    const records = [
      rec(1000, 10, { storeId: STORE_A, brandId: BRAND_X }),
      rec(800, 5, { storeId: STORE_A, brandId: BRAND_Y }),
    ];
    const out = cheaperBrandSwap('pro', records, NOW);
    expect(out).toMatchObject({
      storeId: STORE_A,
      cheaperBrandId: BRAND_Y,
      pricierBrandId: BRAND_X,
      cheaperCents: 800,
      pricierCents: 1000,
      savingsPct: 20,
    });
  });

  // S2/AC4: economia < 10% → null
  it('null quando economia é menor que 10%', () => {
    // 1000 vs 950 → 5% < 10%
    const records = [
      rec(1000, 10, { storeId: STORE_A, brandId: BRAND_X }),
      rec(950, 5, { storeId: STORE_A, brandId: BRAND_Y }),
    ];
    expect(cheaperBrandSwap('pro', records, NOW)).toBeNull();
  });

  // Edge: economia exatamente no limiar (10%) → sugere (inclusivo)
  it('sugere quando economia é exatamente 10%', () => {
    // 1000 vs 900 → exatamente 10%
    const records = [
      rec(1000, 10, { storeId: STORE_A, brandId: BRAND_X }),
      rec(900, 5, { storeId: STORE_A, brandId: BRAND_Y }),
    ];
    expect(cheaperBrandSwap('pro', records, NOW)?.savingsPct).toBe(10);
  });

  // S2/AC5: várias lojas → vence a maior economia %
  it('escolhe a loja com maior economia percentual', () => {
    const records = [
      // STORE_A: 1000 vs 850 → 15%
      rec(1000, 10, { storeId: STORE_A, brandId: BRAND_X }),
      rec(850, 5, { storeId: STORE_A, brandId: BRAND_Y }),
      // STORE_B: 1000 vs 600 → 40% (vence)
      rec(1000, 10, { storeId: STORE_B, brandId: BRAND_X }),
      rec(600, 5, { storeId: STORE_B, brandId: BRAND_Y }),
    ];
    const out = cheaperBrandSwap('pro', records, NOW);
    expect(out?.storeId).toBe(STORE_B);
    expect(out?.savingsPct).toBe(40);
  });

  // S2/AC6: usa o ÚLTIMO preço de cada (loja, marca)
  it('usa o último preço de cada marca na loja', () => {
    const records = [
      rec(2000, 40, { storeId: STORE_A, brandId: BRAND_X }), // antigo — ignorado
      rec(1000, 5, { storeId: STORE_A, brandId: BRAND_X }), // atual de X
      rec(800, 3, { storeId: STORE_A, brandId: BRAND_Y }), // atual de Y
    ];
    const out = cheaperBrandSwap('pro', records, NOW);
    expect(out?.pricierCents).toBe(1000); // último de X, não o 2000 velho
    expect(out?.cheaperCents).toBe(800);
  });

  // Edge: tudo mesma marca → null
  it('null quando há uma marca só', () => {
    const records = [
      rec(1000, 10, { storeId: STORE_A, brandId: BRAND_X }),
      rec(800, 5, { storeId: STORE_A, brandId: BRAND_X }),
    ];
    expect(cheaperBrandSwap('pro', records, NOW)).toBeNull();
  });

  // Edge: tudo sem marca (brandId null) → null
  it('null quando os registros não têm marca', () => {
    const records = [rec(1000, 10, { storeId: STORE_A }), rec(800, 5, { storeId: STORE_A })];
    expect(cheaperBrandSwap('pro', records, NOW)).toBeNull();
  });

  // Edge: marcas em lojas diferentes sem interseção → null
  it('null quando as marcas estão em lojas diferentes (sem par na mesma loja)', () => {
    const records = [
      rec(1000, 10, { storeId: STORE_A, brandId: BRAND_X }),
      rec(600, 5, { storeId: STORE_B, brandId: BRAND_Y }),
    ];
    expect(cheaperBrandSwap('pro', records, NOW)).toBeNull();
  });

  // Edge: preços velhos fora da janela não formam par
  it('ignora preços fora da janela de 90d', () => {
    const old = INSIGHTS_WINDOW_DAYS + 10;
    const records = [
      rec(1000, 10, { storeId: STORE_A, brandId: BRAND_X }),
      rec(600, old, { storeId: STORE_A, brandId: BRAND_Y }), // marca Y só fora da janela
    ];
    expect(cheaperBrandSwap('pro', records, NOW)).toBeNull();
  });
});
