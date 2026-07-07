import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  BillingEvent,
  CreateSubscriptionParams,
  CreateSubscriptionResult,
  PaymentProvider,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.stripe.com';

/** Tolerância do timestamp da assinatura do webhook (5 min) — barra replay. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Corpo do evento do webhook do Stripe (só os campos que consumimos). */
interface StripeWebhookEvent {
  id?: string;
  type?: string;
  data?: { object?: StripeEventObject };
}

/**
 * Objeto do evento — os campos variam por tipo. invoice.* traz `subscription`;
 * customer.subscription.* é a própria subscription (`id`); charge.* correlaciona
 * via metadata (a subscription não vem direto no charge).
 */
interface StripeEventObject {
  id?: string;
  subscription?: string;
  metadata?: { subscriptionId?: string };
}

/**
 * Traduz o nome cru do evento Stripe pro tipo normalizado da porta. Retorna null
 * pra eventos irrelevantes à máquina de estados (o handler responde 200).
 */
function mapEventType(event: string): BillingEvent['type'] | null {
  if (event === 'invoice.paid' || event === 'invoice.payment_succeeded') return 'payment_confirmed';
  if (event === 'invoice.payment_failed') return 'payment_overdue';
  if (event === 'customer.subscription.deleted') return 'subscription_deleted';
  if (event === 'charge.refunded') return 'payment_refunded';
  if (event === 'charge.dispute.created') return 'chargeback';
  return null;
}

/**
 * Extrai o id externo da assinatura afetada — a fonte varia por tipo de evento:
 *   invoice.*                    → object.subscription
 *   customer.subscription.*      → object.id (o objeto É a subscription)
 *   charge.*                     → object.metadata.subscriptionId (charge não traz a sub)
 */
function extractSubscriptionId(type: string, obj: StripeEventObject): string | undefined {
  if (type.startsWith('invoice.')) return obj.subscription;
  if (type.startsWith('customer.subscription.')) return obj.id;
  if (type.startsWith('charge.')) return obj.metadata?.subscriptionId;
  return obj.subscription ?? obj.id;
}

/**
 * Serializa um objeto aninhado no formato bracket que o Stripe espera
 * (application/x-www-form-urlencoded), ex.: items[0][price_data][currency]=usd.
 * Recursivo: percorre objetos/arrays montando as chaves com colchetes.
 */
function encodeForm(obj: Record<string, unknown>, prefix = ''): string[] {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        const itemKey = `${fullKey}[${i}]`;
        if (item !== null && typeof item === 'object') {
          pairs.push(...encodeForm(item as Record<string, unknown>, itemKey));
        } else {
          pairs.push(`${encodeURIComponent(itemKey)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof value === 'object') {
      pairs.push(...encodeForm(value as Record<string, unknown>, fullKey));
    } else {
      pairs.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
    }
  }
  return pairs;
}

function toFormBody(obj: Record<string, unknown>): string {
  return encodeForm(obj).join('&');
}

/**
 * Adapter Stripe — REST via fetch (sem SDK, igual ao Asaas/Resend). ATENÇÃO: a API
 * do Stripe é application/x-www-form-urlencoded (não JSON) e valores monetários já
 * vêm em unidades mínimas (cents) — priceCents vai direto em unit_amount, SEM dividir
 * por 100 (divergência do Asaas, que manda reais decimais).
 *
 * Fluxo de assinatura: cria o customer, cria a subscription com
 * payment_behavior=default_incomplete (a fatura fica pagável) e expand=latest_invoice
 * pra pegar a hosted_invoice_url — a URL de checkout hosted. A subscription existe
 * ANTES do pagamento, então a correlação é determinística (externalId na nossa linha).
 */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe' as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }

  private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: toFormBody(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`stripe_${res.status}: ${detail.slice(0, 200)}`);
    }
    return res.json();
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<CreateSubscriptionResult> {
    // cpfCnpj é ignorado — o Stripe não tem campo equivalente e nada é persistido (LGPD).
    const customer = (await this.post('/v1/customers', {
      name: params.customer.name,
      email: params.customer.email,
      metadata: { householdId: params.householdId },
    })) as { id?: string };
    const externalCustomerId = customer.id ?? '';

    const subscription = (await this.post('/v1/subscriptions', {
      customer: externalCustomerId,
      items: [
        {
          price_data: {
            // unit_amount em CENTAVOS direto — Stripe usa minor units (sem ÷100).
            currency: params.currency.toLowerCase(),
            unit_amount: params.priceCents,
            recurring: { interval: params.cycle === 'yearly' ? 'year' : 'month' },
            product_data: { name: 'Grosify Pro' },
          },
        },
      ],
      // default_incomplete deixa a 1ª fatura pagável (gera a hosted invoice de checkout).
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata: { householdId: params.householdId },
      'expand[]': 'latest_invoice',
    })) as { id?: string; latest_invoice?: { hosted_invoice_url?: string } };

    const externalId = subscription.id ?? '';
    const checkoutUrl = subscription.latest_invoice?.hosted_invoice_url ?? '';

    return { externalId, externalCustomerId, checkoutUrl };
  }

  async cancelSubscription(externalId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/subscriptions/${externalId}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    // 404 = assinatura já não existe no Stripe → cancelamento é idempotente pra nós.
    if (res.ok || res.status === 404) return;
    const detail = await res.text().catch(() => '');
    throw new Error(`stripe_${res.status}: ${detail.slice(0, 200)}`);
  }

  async verifyAndParseWebhook(req: Request): Promise<BillingEvent | null> {
    const payload = await req.text();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers.get('stripe-signature');

    if (secret) {
      if (!verifyStripeSignature(secret, signature, payload)) return null;
    } else {
      console.warn(
        '[webhook:stripe] STRIPE_WEBHOOK_SECRET ausente — assinatura não verificada (dev).',
      );
    }

    let event: StripeWebhookEvent;
    try {
      event = JSON.parse(payload) as StripeWebhookEvent;
    } catch {
      return null;
    }

    const eventId = event.id;
    const eventName = event.type;
    if (!eventId || !eventName) return null;

    const type = mapEventType(eventName);
    // Evento irrelevante à máquina — null; o handler responde 200 sem efeito.
    if (!type) return null;

    const obj = event.data?.object ?? {};
    const externalSubscriptionId = extractSubscriptionId(eventName, obj);
    if (!externalSubscriptionId) return null;

    return { eventId, type, externalSubscriptionId, raw: event };
  }
}

/**
 * Verifica a assinatura do webhook do Stripe. Header `Stripe-Signature` no formato
 * `t=<timestamp>,v1=<hmac>`; HMAC-SHA256(secret, `${t}.${payload}`) em hex. Tolerância
 * de 5 min barra replay. timingSafeEqual evita timing attack (mesmo padrão do verifySvix).
 * Exportada pra a rota reusar a mesma verificação.
 */
export function verifyStripeSignature(
  secret: string,
  header: string | null,
  payload: string,
): boolean {
  if (!header) return false;

  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = value;
    else if (key === 'v1' && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const b = Buffer.from(expected);
  for (const sig of signatures) {
    const a = Buffer.from(sig);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}
