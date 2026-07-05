import type {
  BillingEvent,
  CreateSubscriptionParams,
  CreateSubscriptionResult,
  PaymentProvider,
} from './types.js';

/**
 * Adapter Asaas — implementação real chega na task seguinte. Por ora é o esqueleto
 * que a factory referencia (env-gate BRL). Mantém a factory como único lugar que
 * conhece adapters concretos.
 */
export class AsaasProvider implements PaymentProvider {
  readonly name = 'asaas' as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  createSubscription(_params: CreateSubscriptionParams): Promise<CreateSubscriptionResult> {
    throw new Error('not_implemented');
  }

  cancelSubscription(_externalId: string): Promise<void> {
    throw new Error('not_implemented');
  }

  verifyAndParseWebhook(_req: Request): Promise<BillingEvent | null> {
    throw new Error('not_implemented');
  }
}
