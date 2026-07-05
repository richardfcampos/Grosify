export const PLANS = ['free', 'pro'] as const;
export type Plan = (typeof PLANS)[number];

export const FREE_MAX_ITEMS = 30;
export const FREE_MAX_LISTS = 2;
export const FREE_MAX_MEMBERS = 2;
export const FREE_HISTORY_DAYS = 90;

/** Preços por moeda em unidades mínimas (cents) — preço psicológico local, não câmbio. */
export const PLAN_PRICES = {
  BRL: { monthly: 1290, yearly: 9900 },
  USD: { monthly: 399, yearly: 2900 },
} as const;

export function maxItems(plan: Plan): number {
  return plan === 'pro' ? Number.POSITIVE_INFINITY : FREE_MAX_ITEMS;
}

export function maxLists(plan: Plan): number {
  return plan === 'pro' ? Number.POSITIVE_INFINITY : FREE_MAX_LISTS;
}

export function maxMembers(plan: Plan): number {
  return plan === 'pro' ? Number.POSITIVE_INFINITY : FREE_MAX_MEMBERS;
}

/** Data mínima visível no histórico de preços para o plano. */
export function historyCutoff(plan: Plan, now: Date): Date | null {
  if (plan === 'pro') return null;
  return new Date(now.getTime() - FREE_HISTORY_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Filtro de leitura no downgrade: pro vê tudo; free vê só os `cap` mais antigos
 * (ordem determinística por id asc — uuidv7 é time-ordered, então isso é ordem
 * de criação sem precisar de coluna extra). Puro — nada é apagado, só ocultado.
 */
export function applyFreeCaps<T extends { id: string }>(rows: T[], cap: number, plan: Plan): T[] {
  if (plan === 'pro') return rows;
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, cap);
}
