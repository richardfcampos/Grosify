import { dailyConsumptionRate, daysUntilOut } from '@grosify/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db, type LocalMovement } from '../db/dexie.js';
import { useHouseholdPlan } from './use-currency.js';

/**
 * Previsão de reposição por item: Map itemId → dias até acabar (só itens com previsão).
 *
 * Pro-only (S2/AC1): plano free retorna Map vazio — não computa nem vaza o número.
 * Client-side puro sobre o ledger de movimentos + saldo do estoque; a heurística
 * mora nas funções de domínio do shared (`dailyConsumptionRate`/`daysUntilOut`).
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
    [],
  );

  return useMemo(() => {
    const forecast = new Map<string, number>();
    if (plan !== 'pro') return forecast; // free não computa (Pro-only)

    // agrupa movimentos por item pra calcular a taxa uma vez por item
    const byItem = new Map<string, LocalMovement[]>();
    for (const m of movements) {
      const list = byItem.get(m.itemId);
      if (list) list.push(m);
      else byItem.set(m.itemId, [m]);
    }

    const now = new Date();
    for (const inv of inventory) {
      const rate = dailyConsumptionRate(byItem.get(inv.itemId) ?? [], undefined, now);
      const days = daysUntilOut(Number(inv.qtyOnHand), rate);
      if (days !== null) forecast.set(inv.itemId, days);
    }
    return forecast;
  }, [plan, movements, inventory]);
}
