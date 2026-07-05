import { AsaasProvider } from './asaas-provider.js';
import { StripeProvider } from './stripe-provider.js';
import type { PaymentProvider } from './types.js';

export type {
  BillingCustomer,
  BillingCycle,
  BillingEvent,
  CreateSubscriptionParams,
  CreateSubscriptionResult,
  PaymentProvider,
  ProviderName,
} from './types.js';

type Env = Record<string, string | undefined>;

const ASAAS_DEFAULT_BASE_URL = 'https://api-sandbox.asaas.com/v3';

/**
 * Factory — ÚNICO lugar que conhece providers concretos. Roteia por moeda:
 *   BRL          → Asaas  (se ASAAS_API_KEY; senão null → rota responde 501)
 *   outra moeda  → Stripe (se STRIPE_SECRET_KEY; senão null → rota responde 501)
 *
 * Pra plugar um gateway novo: implemente `PaymentProvider` num `*-provider.ts` e
 * registre um branch aqui. Nenhum caller muda.
 */
export function billingProviderFor(
  currency: string,
  env: Env = process.env,
): PaymentProvider | null {
  if (currency === 'BRL') {
    const key = env.ASAAS_API_KEY;
    if (!key) return null;
    return new AsaasProvider(key, env.ASAAS_BASE_URL ?? ASAAS_DEFAULT_BASE_URL);
  }

  const key = env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new StripeProvider();
}

// Injeção pra testes: 2 slots (BRL e "resto"). Espelha setEmailProvider, adaptado
// a moeda. Um override registrado vence a factory até ser resetado.
const overrides = new Map<string, PaymentProvider>();

function slotFor(currency: string): string {
  return currency === 'BRL' ? 'BRL' : 'other';
}

export function setBillingProvider(currency: string, provider: PaymentProvider): void {
  overrides.set(slotFor(currency), provider);
}

export function resetBillingProviders(): void {
  overrides.clear();
}

/** Resolve o provider efetivo pra uma moeda: override de teste vence a factory. */
export function getBillingProvider(
  currency: string,
  env: Env = process.env,
): PaymentProvider | null {
  const override = overrides.get(slotFor(currency));
  if (override) return override;
  return billingProviderFor(currency, env);
}
