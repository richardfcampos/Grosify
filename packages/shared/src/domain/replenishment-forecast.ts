import type { StockMovement } from '../schemas/index.js';

/** Janela padrão (dias corridos) da estimativa de consumo. */
export const FORECAST_WINDOW_DAYS = 60;

/** Mínimo de eventos de consumo na janela pra confiar na taxa (item novo/esporádico → sem previsão). */
export const FORECAST_MIN_EVENTS = 2;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Taxa diária de consumo de um item a partir do ledger de movimentos.
 *
 * Usa só movimentos `consumption` (baixa real do estoque; `qty` sempre ≤ 0) dentro
 * da janela — `purchase`/`adjustment`/`count` não são consumo. Divide o total
 * consumido pela janela INTEIRA em dias (não por "dias com dados"), pra item de
 * giro lento render taxa baixa. Retorna `null` com menos de FORECAST_MIN_EVENTS
 * eventos na janela (dados insuficientes).
 */
export function dailyConsumptionRate(
  movements: StockMovement[],
  windowDays: number = FORECAST_WINDOW_DAYS,
  now: Date = new Date(),
): number | null {
  const cutoff = now.getTime() - windowDays * MS_PER_DAY;
  let consumed = 0;
  let events = 0;
  for (const m of movements) {
    if (m.type !== 'consumption') continue;
    if (new Date(m.movedAt).getTime() < cutoff) continue; // fora da janela
    consumed += -m.qty; // qty de consumo é negativo; consumido é o oposto
    events++;
  }
  if (events < FORECAST_MIN_EVENTS) return null;
  return consumed / windowDays;
}

/**
 * Dias até o estoque zerar dado o saldo atual e a taxa diária.
 * `null` quando não há previsão possível: sem taxa, taxa não-positiva
 * (nenhum consumo) ou estoque já zerado/negativo.
 */
export function daysUntilOut(qtyOnHand: number, rate: number | null): number | null {
  if (rate == null || rate <= 0 || qtyOnHand <= 0) return null;
  return Math.floor(qtyOnHand / rate);
}
