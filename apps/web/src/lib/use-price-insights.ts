import {
  buyOrWaitVerdict,
  cheaperBrandSwap,
  type BuyOrWaitInsight,
  type CheaperBrandSwap,
  type Plan,
} from '@grosify/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db, type LocalPrice } from '../db/dexie.js';
import { useHouseholdPlan } from './use-currency.js';

export interface PriceInsights {
  verdict: BuyOrWaitInsight | null;
  swap: CheaperBrandSwap | null;
}

/**
 * Monta os dois insights de preço. Pura (testável): o gate Pro-only vive nas funções
 * de domínio (`plan` como 1º arg) — plano free retorna ambos `null` sem computar nada
 * (invariante de privacidade: o veredito não pode nem existir pro free).
 *
 * Opera sobre o histórico COMPLETO do item (sem o cutoff 90d do plano free); cada função
 * de domínio aplica sua própria janela de relevância internamente.
 */
export function buildPriceInsights(
  plan: Plan,
  records: LocalPrice[],
  now: Date = new Date(),
): PriceInsights {
  return {
    verdict: buyOrWaitVerdict(plan, records, now),
    swap: cheaperBrandSwap(plan, records, now),
  };
}

/**
 * Insights de preço do item a partir do histórico local completo (Dexie).
 * Client-side puro sobre `price_records`; heurística nas funções de domínio do shared.
 */
export function usePriceInsights(itemId: string, allPrices: LocalPrice[]): PriceInsights {
  const plan = useHouseholdPlan();
  return useMemo(() => buildPriceInsights(plan, allPrices), [plan, allPrices]);
}
