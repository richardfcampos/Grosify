/**
 * Porta de cobrança (Dependency Inversion) — espelha o padrão do email/types.ts.
 *
 *   ┌────────────────────┐      depende de       ┌──────────────────┐
 *   │ rotas /billing +   │ ───────────────────▶  │  PaymentProvider │  (porta, esta interface)
 *   │ webhook            │  billingProviderFor   │  + BillingEvent  │
 *   └────────────────────┘                       └────────┬─────────┘
 *                                                implementa │
 *                              ┌──────────────────┬─────────┴──────────┐
 *                              ▼                  ▼                    ▼
 *                        AsaasProvider      StripeProvider (stub)   (futuro…)
 *
 * A factory (./index.ts) é o ÚNICO lugar que conhece os adapters concretos. Trocar/
 * adicionar gateway = implementar PaymentProvider + registrar um case. Callers não mudam.
 */

/** Nome do gateway que originou a assinatura — travado na linha de subscriptions. */
export type ProviderName = 'asaas' | 'stripe';

/** Ciclo de cobrança da assinatura. */
export type BillingCycle = 'monthly' | 'yearly';

/** Dados do pagador coletados no checkout (CPF/CNPJ exigido pela API BR; não persistido). */
export interface BillingCustomer {
  name: string;
  email: string;
  cpfCnpj: string;
}

/** Parâmetros de criação de assinatura. Preço vem em cents (unidade mínima da moeda). */
export interface CreateSubscriptionParams {
  householdId: string;
  cycle: BillingCycle;
  currency: string;
  priceCents: number;
  customer: BillingCustomer;
}

/** Resultado da criação: ids externos pra correlação + URL de checkout hosted. */
export interface CreateSubscriptionResult {
  externalId: string;
  externalCustomerId: string;
  checkoutUrl: string;
}

/**
 * Evento de billing já normalizado — todos os providers convergem pra este shape
 * antes de tocar a máquina de estados (lifecycle.ts). type mapeia intenção, não o
 * nome cru do gateway.
 */
export interface BillingEvent {
  /** id do evento no gateway — chave de idempotência (webhook_events). */
  eventId: string;
  type:
    | 'payment_confirmed'
    | 'payment_overdue'
    | 'payment_refunded'
    | 'chargeback'
    | 'subscription_deleted';
  /** id externo da assinatura que o evento afeta (correlação com subscriptions.externalId). */
  externalSubscriptionId: string;
  /** payload cru do gateway — pra log/auditoria e campos extras (ex.: nextDueDate). */
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: ProviderName;
  createSubscription(params: CreateSubscriptionParams): Promise<CreateSubscriptionResult>;
  cancelSubscription(externalId: string): Promise<void>;
  /**
   * Verifica autenticidade e parseia o webhook. Retorna o evento normalizado, ou
   * null quando o evento é irrelevante pra máquina de estados ou a auth falhou —
   * o handler responde 200/401 conforme o caso.
   */
  verifyAndParseWebhook(req: Request): Promise<BillingEvent | null>;
}
