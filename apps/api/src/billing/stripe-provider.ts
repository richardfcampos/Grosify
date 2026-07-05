import type { CreateSubscriptionParams, CreateSubscriptionResult, PaymentProvider } from './types.js';

/**
 * Stub do Stripe — a porta está pronta, mas não há pagante internacional ainda.
 * Todo método lança `provider_unavailable`; a rota traduz isso em 501. Quando
 * houver credencial + implementação real, este arquivo vira o adapter concreto
 * e a factory já roteia moeda ≠ BRL pra cá sem tocar em callers.
 */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe' as const;

  createSubscription(_params: CreateSubscriptionParams): Promise<CreateSubscriptionResult> {
    throw new Error('provider_unavailable');
  }

  cancelSubscription(_externalId: string): Promise<void> {
    throw new Error('provider_unavailable');
  }

  verifyAndParseWebhook(_req: Request): Promise<null> {
    throw new Error('provider_unavailable');
  }
}
