export const PLANS = ['free', 'pro'] as const;
export type Plan = (typeof PLANS)[number];

export const FREE_MAX_ITEMS = 30;
export const FREE_HISTORY_DAYS = 90;
export const PRO_PRICE_CENTS = 990;

export function maxItems(_plan: Plan): number {
  // Limite do free suspenso até a regra de plano ser decidida — sem teto pra ninguém.
  // Quando voltar a valer, trocar por: plan === 'pro' ? Infinity : FREE_MAX_ITEMS
  return Number.POSITIVE_INFINITY;
}

/** Data mínima visível no histórico de preços para o plano. */
export function historyCutoff(plan: Plan, now: Date): Date | null {
  if (plan === 'pro') return null;
  return new Date(now.getTime() - FREE_HISTORY_DAYS * 24 * 60 * 60 * 1000);
}
