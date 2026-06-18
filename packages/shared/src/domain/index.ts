import type { PriceRecord, Unit } from '../schemas/index.js';

/** Fatores de conversão entre unidades da MESMA dimensão (massa, volume). */
const UNIT_FACTOR: Record<string, number> = {
  'g>kg': 1 / 1000,
  'kg>g': 1000,
  'ml>l': 1 / 1000,
  'l>ml': 1000,
};

/** Converte um valor entre g↔kg / ml↔L. Retorna null se as unidades não combinam. */
export function convertUnit(value: number, from: Unit, to: Unit): number | null {
  if (from === to) return value;
  const factor = UNIT_FACTOR[`${from}>${to}`];
  return factor === undefined ? null : value * factor;
}

/** Unidade "base" pra mostrar preço normalizado (g→kg, ml→L); null se já é base/un. */
export function baseUnitFor(unit: Unit): Unit | null {
  if (unit === 'g') return 'kg';
  if (unit === 'ml') return 'l';
  return null;
}

/** Quanto falta comprar: padrão mensal menos o que tem em casa, nunca negativo. */
export function neededQty(defaultMonthlyQty: number, qtyOnHand: number): number {
  return Math.max(round3(defaultMonthlyQty - qtyOnHand), 0);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function isLive(r: PriceRecord): boolean {
  return r.deletedAt === null;
}

/** Chave de comparação: preço é por (loja, marca). Marca null agrupa junto. */
function storeBrandKey(storeId: string, brandId: string | null): string {
  return `${storeId}|${brandId ?? ''}`;
}

/** Último preço por (loja, marca) — registros do MESMO item. */
export function latestPriceByStoreBrand(records: PriceRecord[]): Map<string, PriceRecord> {
  const latest = new Map<string, PriceRecord>();
  for (const r of records) {
    if (!isLive(r)) continue;
    const k = storeBrandKey(r.storeId, r.brandId);
    const current = latest.get(k);
    if (!current || r.recordedAt > current.recordedAt) latest.set(k, r);
  }
  return latest;
}

export interface CheapestStore {
  storeId: string;
  brandId: string | null;
  priceCents: number;
  recordedAt: string;
}

/**
 * Combinação loja+marca com menor último-preço para um item (cruza todas as marcas).
 * Empate: registro mais recente vence.
 */
export function cheapestStore(records: PriceRecord[]): CheapestStore | null {
  let best: PriceRecord | null = null;
  for (const r of latestPriceByStoreBrand(records).values()) {
    if (
      !best ||
      r.priceCents < best.priceCents ||
      (r.priceCents === best.priceCents && r.recordedAt > best.recordedAt)
    ) {
      best = r;
    }
  }
  return best
    ? {
        storeId: best.storeId,
        brandId: best.brandId,
        priceCents: best.priceCents,
        recordedAt: best.recordedAt,
      }
    : null;
}

export interface PriceChange {
  previousPriceCents: number;
  previousRecordedAt: string;
  deltaCents: number;
  deltaPct: number;
}

/**
 * Compara preço novo com o último conhecido na MESMA loja E MESMA marca.
 * Retorna null se não há histórico anterior pra essa combinação.
 */
export function priceChange(
  newPriceCents: number,
  storeId: string,
  brandId: string | null,
  records: PriceRecord[],
): PriceChange | null {
  const previous = latestPriceByStoreBrand(records).get(storeBrandKey(storeId, brandId));
  if (!previous) return null;
  const deltaCents = newPriceCents - previous.priceCents;
  return {
    previousPriceCents: previous.priceCents,
    previousRecordedAt: previous.recordedAt,
    deltaCents,
    deltaPct: Math.round((deltaCents / previous.priceCents) * 1000) / 10,
  };
}

/** Preço médio dos registros vivos do MESMO item desde uma data ISO; null se nenhum. */
export function averagePrice(records: PriceRecord[], sinceISO: string): number | null {
  const live = records.filter((r) => isLive(r) && r.recordedAt >= sinceISO);
  if (live.length === 0) return null;
  const sum = live.reduce((acc, r) => acc + r.priceCents, 0);
  return Math.round(sum / live.length);
}

/** Limite de variação (%) a partir do qual um aumento/queda vira alerta. */
export const PRICE_ALERT_THRESHOLD_PCT = 10;

export interface EstimateLine {
  qty: number;
  unitPriceCents: number | null;
}

export interface EstimateTotal {
  totalCents: number;
  pricedLines: number;
  missingPriceLines: number;
}

/** Total estimado: soma qty × preço unitário; linhas sem preço contam como faltantes. */
export function estimateTotal(lines: EstimateLine[]): EstimateTotal {
  let totalCents = 0;
  let pricedLines = 0;
  let missingPriceLines = 0;
  for (const line of lines) {
    if (line.unitPriceCents === null) {
      missingPriceLines++;
      continue;
    }
    totalCents += Math.round(line.qty * line.unitPriceCents);
    pricedLines++;
  }
  return { totalCents, pricedLines, missingPriceLines };
}

export * from './currency.js';
