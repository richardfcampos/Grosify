import type { PriceRecord } from '../schemas/index.js';

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

/** Último preço registrado por loja para um conjunto de registros do MESMO item. */
export function latestPriceByStore(records: PriceRecord[]): Map<string, PriceRecord> {
  const latest = new Map<string, PriceRecord>();
  for (const r of records) {
    if (!isLive(r)) continue;
    const current = latest.get(r.storeId);
    if (!current || r.recordedAt > current.recordedAt) latest.set(r.storeId, r);
  }
  return latest;
}

export interface CheapestStore {
  storeId: string;
  priceCents: number;
  recordedAt: string;
}

/** Loja com menor último-preço para um item. Empate: registro mais recente vence. */
export function cheapestStore(records: PriceRecord[]): CheapestStore | null {
  let best: PriceRecord | null = null;
  for (const r of latestPriceByStore(records).values()) {
    if (
      !best ||
      r.priceCents < best.priceCents ||
      (r.priceCents === best.priceCents && r.recordedAt > best.recordedAt)
    ) {
      best = r;
    }
  }
  return best
    ? { storeId: best.storeId, priceCents: best.priceCents, recordedAt: best.recordedAt }
    : null;
}

export interface PriceChange {
  previousPriceCents: number;
  previousRecordedAt: string;
  deltaCents: number;
  deltaPct: number;
}

/**
 * Compara preço novo com o último conhecido na MESMA loja.
 * Retorna null se não há histórico anterior na loja.
 */
export function priceChange(
  newPriceCents: number,
  storeId: string,
  records: PriceRecord[],
): PriceChange | null {
  const previous = latestPriceByStore(records).get(storeId);
  if (!previous) return null;
  const deltaCents = newPriceCents - previous.priceCents;
  return {
    previousPriceCents: previous.priceCents,
    previousRecordedAt: previous.recordedAt,
    deltaCents,
    deltaPct: Math.round((deltaCents / previous.priceCents) * 1000) / 10,
  };
}

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

/** Formata centavos como BRL: 1234 → "R$ 12,34". */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
