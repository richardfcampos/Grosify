import type { Plan } from '../plans.js';
import type { PriceRecord } from '../schemas/index.js';
import { averagePrice, latestPriceByStoreBrand } from './index.js';

/** Janela de relevância (dias corridos) dos insights de preço — bate com a média 90d e o histórico free. */
export const INSIGHTS_WINDOW_DAYS = 90;

/** Mínimo de registros na janela pra confiar num veredito de tendência. */
export const INSIGHTS_MIN_RECORDS = 3;

/** Atual ≤ média·(1 − 3%) → sinal de compra (está abaixo da média). */
export const BUY_BELOW_AVG_PCT = 3;

/** Atual ≥ média·(1 + 5%) E subindo → sinal de espera (caro e subindo). */
export const WAIT_ABOVE_AVG_PCT = 5;

/** Economia mínima (%) pra sugerir troca de marca — reusa o limiar de alerta de preço. */
export const SWAP_MIN_SAVINGS_PCT = 10;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO do começo da janela de N dias a partir de `now`. */
function windowStartISO(now: Date): string {
  return new Date(now.getTime() - INSIGHTS_WINDOW_DAYS * MS_PER_DAY).toISOString();
}

/** Registros vivos dentro da janela, ordenados por `recordedAt` ascendente (cronológico). */
function liveInWindowAsc(records: PriceRecord[], now: Date): PriceRecord[] {
  const start = windowStartISO(now);
  return records
    .filter((r) => r.deletedAt === null && r.recordedAt >= start)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export type Verdict = 'buy' | 'wait' | 'neutral';

export interface BuyOrWaitInsight {
  verdict: Verdict;
  currentCents: number;
  avgCents: number;
}

/**
 * Veredito "compre agora ou espere" a partir da tendência do histórico do MESMO item.
 *
 * Pro-only: o gate de privacidade vive AQUI (padrão `buildForecastMap`) — free retorna
 * `null` sem computar nada. `null` também quando faltam dados (< INSIGHTS_MIN_RECORDS na janela).
 *
 * Regras (janela de 90d, "atual" = registro mais recente, "média" = averagePrice na janela):
 * - buy: atual ≤ média·0,97 OU os 3 últimos estritamente caindo.
 * - wait: atual ≥ média·1,05 E os 2 últimos estritamente subindo.
 * - buy vence quando as duas condições colidem (queda recente é o sinal mais acionável).
 * - senão: neutral.
 */
export function buyOrWaitVerdict(
  plan: Plan,
  records: PriceRecord[],
  now: Date = new Date(),
): BuyOrWaitInsight | null {
  if (plan !== 'pro') return null; // free não computa (Pro-only)

  const asc = liveInWindowAsc(records, now);
  if (asc.length < INSIGHTS_MIN_RECORDS) return null; // dados insuficientes

  const start = windowStartISO(now);
  const avgCents = averagePrice(records, start);
  if (avgCents == null) return null; // defensivo — asc não-vazio já garante média

  // preços vivos na janela, em ordem cronológica (asc já garantido não-vazio)
  const cents = asc.map((r) => r.priceCents);
  const currentCents = cents[cents.length - 1] as number;

  // últimos 3 estritamente decrescentes → queda consistente
  const last3 = cents.slice(-3);
  const falling3 =
    last3.length === 3 && (last3[0] as number) > (last3[1] as number) && (last3[1] as number) > (last3[2] as number);

  // últimos 2 estritamente crescentes → subindo
  const last2 = cents.slice(-2);
  const rising2 = last2.length === 2 && (last2[0] as number) < (last2[1] as number);

  const belowAvg = currentCents <= Math.round(avgCents * (1 - BUY_BELOW_AVG_PCT / 100));
  const aboveAvg = currentCents >= Math.round(avgCents * (1 + WAIT_ABOVE_AVG_PCT / 100));

  // buy tem precedência sobre wait quando ambos batem
  let verdict: Verdict = 'neutral';
  if (belowAvg || falling3) verdict = 'buy';
  else if (aboveAvg && rising2) verdict = 'wait';

  return { verdict, currentCents, avgCents };
}

export interface CheaperBrandSwap {
  storeId: string;
  cheaperBrandId: string;
  pricierBrandId: string;
  cheaperCents: number;
  pricierCents: number;
  savingsPct: number;
}

/**
 * Melhor troca de marca: numa MESMA loja, a marca mais barata vs a mais cara.
 *
 * Pro-only (gate de privacidade). Precisa de ≥2 marcas distintas e não-nulas com
 * último-preço na janela de 90d na mesma loja. Só sugere se a economia ≥ SWAP_MIN_SAVINGS_PCT.
 * Com pares em várias lojas, vence a maior economia % (empate: maior economia absoluta).
 */
export function cheaperBrandSwap(
  plan: Plan,
  records: PriceRecord[],
  now: Date = new Date(),
): CheaperBrandSwap | null {
  if (plan !== 'pro') return null; // free não computa (Pro-only)

  const inWindow = liveInWindowAsc(records, now);
  // último preço por (loja, marca) restrito à janela
  const latest = latestPriceByStoreBrand(inWindow);

  // agrupa por loja apenas os registros COM marca (troca de marca exige marca)
  const byStore = new Map<string, PriceRecord[]>();
  for (const r of latest.values()) {
    if (r.brandId == null) continue;
    const list = byStore.get(r.storeId);
    if (list) list.push(r);
    else byStore.set(r.storeId, [r]);
  }

  let best: CheaperBrandSwap | null = null;
  for (const [storeId, rows] of byStore) {
    if (rows.length < 2) continue; // precisa de ≥2 marcas na mesma loja
    const cheapest = rows.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
    const pricier = rows.reduce((a, b) => (b.priceCents > a.priceCents ? b : a));
    if (cheapest.brandId === pricier.brandId) continue; // defensivo (todas iguais)

    const savingsPct = Math.round(
      ((pricier.priceCents - cheapest.priceCents) / pricier.priceCents) * 100,
    );
    if (savingsPct < SWAP_MIN_SAVINGS_PCT) continue; // diferença irrelevante

    const candidate: CheaperBrandSwap = {
      storeId,
      cheaperBrandId: cheapest.brandId as string,
      pricierBrandId: pricier.brandId as string,
      cheaperCents: cheapest.priceCents,
      pricierCents: pricier.priceCents,
      savingsPct,
    };
    const absSavings = candidate.pricierCents - candidate.cheaperCents;
    const bestAbs = best ? best.pricierCents - best.cheaperCents : -1;
    if (
      !best ||
      candidate.savingsPct > best.savingsPct ||
      (candidate.savingsPct === best.savingsPct && absSavings > bestAbs)
    ) {
      best = candidate;
    }
  }
  return best;
}
