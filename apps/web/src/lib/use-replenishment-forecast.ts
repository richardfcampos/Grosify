import { dailyConsumptionRate, daysUntilOut, type Plan } from '@grosify/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db, type LocalMovement } from '../db/dexie.js';
import { useHouseholdPlan } from './use-currency.js';

/**
 * Monta o Map itemId → dias até acabar. Pura (testável): o gate Pro-only vive AQUI —
 * plano free retorna Map vazio sem computar nada (invariante de privacidade: o número
 * não pode nem existir pra free).
 */
export function buildForecastMap(
  plan: Plan,
  movements: LocalMovement[],
  inventory: Array<{ itemId: string; qtyOnHand: number | string }>,
  now: Date = new Date(),
): Map<string, number> {
  const forecast = new Map<string, number>();
  if (plan !== 'pro') return forecast; // free não computa (Pro-only)

  // agrupa movimentos por item pra calcular a taxa uma vez por item
  const byItem = new Map<string, LocalMovement[]>();
  for (const m of movements) {
    const list = byItem.get(m.itemId);
    if (list) list.push(m);
    else byItem.set(m.itemId, [m]);
  }

  for (const inv of inventory) {
    const rate = dailyConsumptionRate(byItem.get(inv.itemId) ?? [], undefined, now);
    const days = daysUntilOut(Number(inv.qtyOnHand), rate);
    if (days !== null) forecast.set(inv.itemId, days);
  }
  return forecast;
}

/**
 * Previsão de reposição por item: Map itemId → dias até acabar (só itens com previsão).
 * Client-side puro sobre o ledger de movimentos + saldo do estoque; heurística nas
 * funções de domínio do shared (`dailyConsumptionRate`/`daysUntilOut`).
 */
export function useReplenishmentForecast(): Map<string, number> {
  const plan = useHouseholdPlan();

  const movements = useLiveQuery(
    () => db.movements.filter((m) => m.deletedAt === null).toArray(),
    [],
    [] as LocalMovement[],
  );
  const inventory = useLiveQuery(
    () => db.inventory.filter((i) => i.deletedAt === null).toArray(),
    [],
    [] as Array<{ itemId: string; qtyOnHand: number | string }>,
  );

  return useMemo(() => buildForecastMap(plan, movements, inventory), [plan, movements, inventory]);
}
