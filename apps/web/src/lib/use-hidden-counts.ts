import { applyFreeCaps, historyCutoff, maxItems, maxLists } from '@grosify/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie.js';
import { useHouseholdPlan } from './use-currency.js';

export interface HiddenCounts {
  hiddenItems: number;
  hiddenLists: number;
  hiddenPrices: number;
  total: number;
}

/**
 * Diferença entre total local e visível (após applyFreeCaps/historyCutoff) — alimenta
 * o banner "N itens/listas ocultos" no downgrade de plano. Pro sempre retorna zeros:
 * nada fica oculto (mesma regra do filtro de leitura aplicado nas listagens).
 */
export function useHiddenCounts(): HiddenCounts {
  const plan = useHouseholdPlan();

  const items = useLiveQuery(() => db.items.filter((i) => i.deletedAt === null).toArray(), [], []);
  const lists = useLiveQuery(() => db.lists.filter((l) => l.deletedAt === null).toArray(), [], []);
  const prices = useLiveQuery(() => db.prices.filter((p) => p.deletedAt === null).toArray(), [], []);

  if (plan === 'pro') {
    return { hiddenItems: 0, hiddenLists: 0, hiddenPrices: 0, total: 0 };
  }

  const visibleItems = applyFreeCaps(items, maxItems(plan), plan);
  const visibleLists = applyFreeCaps(lists, maxLists(plan), plan);
  const cutoff = historyCutoff(plan, new Date());
  const visiblePrices = cutoff
    ? prices.filter((p) => p.recordedAt >= cutoff.toISOString())
    : prices;

  const hiddenItems = items.length - visibleItems.length;
  const hiddenLists = lists.length - visibleLists.length;
  const hiddenPrices = prices.length - visiblePrices.length;

  return {
    hiddenItems,
    hiddenLists,
    hiddenPrices,
    total: hiddenItems + hiddenLists + hiddenPrices,
  };
}
