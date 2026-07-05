import type {
  BillingEvent,
  CreateSubscriptionParams,
  CreateSubscriptionResult,
  PaymentProvider,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api-sandbox.asaas.com/v3';

/** Corpo do webhook do Asaas (só os campos que consumimos). */
interface AsaasWebhookBody {
  id?: string;
  event?: string;
  payment?: { subscription?: string };
  subscription?: { id?: string };
}

/**
 * Traduz o nome cru do evento Asaas pro tipo normalizado da porta. Retorna null
 * pra eventos que não interessam à máquina de estados (o handler responde 200).
 */
function mapEventType(event: string): BillingEvent['type'] | null {
  if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') return 'payment_confirmed';
  if (event === 'PAYMENT_OVERDUE') return 'payment_overdue';
  if (event === 'PAYMENT_REFUNDED') return 'payment_refunded';
  if (event.startsWith('PAYMENT_CHARGEBACK')) return 'chargeback';
  if (event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_INACTIVATED')
    return 'subscription_deleted';
  return null;
}

/**
 * Adapter Asaas — REST via fetch (sem SDK, pra manter deps mínimas, igual ao Resend).
 *
 * Fluxo de assinatura (abordagem A): cria o customer, cria a subscription com
 * billingType UNDEFINED (o pagador escolhe Pix/cartão na fatura) e busca a 1ª
 * cobrança pra pegar o invoiceUrl — a URL de checkout hosted. Como a subscription
 * existe ANTES do pagamento, a correlação é determinística (externalReference =
 * householdId + externalId salvo na nossa linha).
 */
export class AsaasProvider implements PaymentProvider {
  readonly name = 'asaas' as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {}

  private headers(): Record<string, string> {
    return {
      access_token: this.apiKey,
      'Content-Type': 'application/json',
      // Obrigatório pela API do Asaas — chamadas sem User-Agent são recusadas.
      'User-Agent': 'Grosify',
    };
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`asaas_${res.status}: ${detail.slice(0, 200)}`);
    }
    return res.json();
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<CreateSubscriptionResult> {
    const customer = (await this.post('/customers', {
      name: params.customer.name,
      email: params.customer.email,
      cpfCnpj: params.customer.cpfCnpj,
      notificationDisabled: false,
    })) as { id?: string };
    const externalCustomerId = customer.id ?? '';

    const subscription = (await this.post('/subscriptions', {
      customer: externalCustomerId,
      billingType: 'UNDEFINED',
      // Reais decimais — priceCents é a unidade mínima; dividir por 100 evita cobrar 100x.
      value: params.priceCents / 100,
      nextDueDate: new Date().toISOString().slice(0, 10),
      cycle: params.cycle === 'yearly' ? 'YEARLY' : 'MONTHLY',
      externalReference: params.householdId,
    })) as { id?: string };
    const externalId = subscription.id ?? '';

    const paymentsRes = await fetch(`${this.baseUrl}/subscriptions/${externalId}/payments`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!paymentsRes.ok) {
      const detail = await paymentsRes.text().catch(() => '');
      throw new Error(`asaas_${paymentsRes.status}: ${detail.slice(0, 200)}`);
    }
    const payments = (await paymentsRes.json()) as { data?: { invoiceUrl?: string }[] };
    const checkoutUrl = payments.data?.[0]?.invoiceUrl ?? '';

    return { externalId, externalCustomerId, checkoutUrl };
  }

  async cancelSubscription(externalId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/subscriptions/${externalId}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    // 404 = assinatura já não existe no Asaas → cancelamento é idempotente pra nós.
    if (res.ok || res.status === 404) return;
    const detail = await res.text().catch(() => '');
    throw new Error(`asaas_${res.status}: ${detail.slice(0, 200)}`);
  }

  async verifyAndParseWebhook(req: Request): Promise<BillingEvent | null> {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    const received = req.headers.get('asaas-access-token');
    if (expected) {
      if (received !== expected) return null;
    } else {
      console.warn('[webhook:asaas] ASAAS_WEBHOOK_TOKEN ausente — token não verificado (dev).');
    }

    let body: AsaasWebhookBody;
    try {
      body = (await req.json()) as AsaasWebhookBody;
    } catch {
      return null;
    }

    const eventId = body.id;
    const eventName = body.event;
    if (!eventId || !eventName) return null;

    const type = mapEventType(eventName);
    // Evento irrelevante à máquina — retorna null; o handler responde 200 sem efeito.
    if (!type) return null;

    const externalSubscriptionId = body.payment?.subscription ?? body.subscription?.id;
    if (!externalSubscriptionId) return null;

    return { eventId, type, externalSubscriptionId, raw: body };
  }
}
