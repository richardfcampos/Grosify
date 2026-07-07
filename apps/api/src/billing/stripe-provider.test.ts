import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StripeProvider, verifyStripeSignature } from './stripe-provider.js';
import type { CreateSubscriptionParams } from './types.js';

const BASE = 'https://api.stripe.com';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

// Moeda USD com PLAN_PRICES.USD.monthly = 399 (cents). No Stripe unit_amount é em
// centavos DIRETO — 399 vai como 399 (sem ÷100, ao contrário do Asaas).
const params: CreateSubscriptionParams = {
  householdId: 'hh-1',
  cycle: 'monthly',
  currency: 'USD',
  priceCents: 399,
  customer: { name: 'Ana', email: 'ana@x.com', cpfCnpj: '12345678900' },
};

/** Mock que responde customer e subscription (com latest_invoice) em sequência. */
function mockCreateFlow() {
  return vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'cus_1' }), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'sub_1',
          latest_invoice: { hosted_invoice_url: 'https://stripe/pay/1' },
        }),
        { status: 200 },
      ),
    );
}

/** Decodifica um corpo form-urlencoded numa lista de pares [chave, valor] decodificados. */
function parseFormBody(body: string): [string, string][] {
  return body
    .split('&')
    .filter(Boolean)
    .map((p) => {
      const [k, v] = p.split('=');
      return [decodeURIComponent(k ?? ''), decodeURIComponent(v ?? '')] as [string, string];
    });
}

describe('StripeProvider.createSubscription', () => {
  it('unit_amount = priceCents EM CENTAVOS direto (399 → 399, NUNCA 3.99, sem ÷100)', async () => {
    const fetchMock = mockCreateFlow();
    vi.stubGlobal('fetch', fetchMock);

    await new StripeProvider('sk_test').createSubscription(params);

    // 2ª chamada é POST /v1/subscriptions — inspeciona o corpo form-encoded
    const [, subInit] = fetchMock.mock.calls[1]!;
    const pairs = parseFormBody((subInit as RequestInit).body as string);
    const unitAmount = pairs.find(([k]) => k === 'items[0][price_data][unit_amount]');
    expect(unitAmount?.[1]).toBe('399');
    // garante que NÃO houve divisão por 100
    expect(unitAmount?.[1]).not.toBe('3.99');
    expect(unitAmount?.[1]).not.toBe('3');
  });

  it('corpo é application/x-www-form-urlencoded com as chaves bracket do Stripe', async () => {
    const fetchMock = mockCreateFlow();
    vi.stubGlobal('fetch', fetchMock);

    await new StripeProvider('sk_test').createSubscription(params);

    const [subUrl, subInit] = fetchMock.mock.calls[1]!;
    expect(subUrl).toBe(`${BASE}/v1/subscriptions`);
    const body = (subInit as RequestInit).body as string;
    // é string form-encoded, não JSON
    expect(() => JSON.parse(body)).toThrow();
    const pairs = parseFormBody(body);
    const map = new Map(pairs);
    expect(map.get('customer')).toBe('cus_1');
    expect(map.get('items[0][price_data][currency]')).toBe('usd');
    expect(map.get('items[0][price_data][recurring][interval]')).toBe('month');
    expect(map.get('items[0][price_data][product_data][name]')).toBe('Grosify Pro');
    expect(map.get('payment_behavior')).toBe('default_incomplete');
    expect(map.get('payment_settings[save_default_payment_method]')).toBe('on_subscription');
    expect(map.get('expand[]')).toBe('latest_invoice');
    expect(map.get('metadata[householdId]')).toBe('hh-1');
  });

  it('POST /v1/customers manda name, email e metadata[householdId] (form-encoded)', async () => {
    const fetchMock = mockCreateFlow();
    vi.stubGlobal('fetch', fetchMock);

    await new StripeProvider('sk_test').createSubscription(params);

    const [custUrl, custInit] = fetchMock.mock.calls[0]!;
    expect(custUrl).toBe(`${BASE}/v1/customers`);
    const map = new Map(parseFormBody((custInit as RequestInit).body as string));
    expect(map.get('name')).toBe('Ana');
    expect(map.get('email')).toBe('ana@x.com');
    expect(map.get('metadata[householdId]')).toBe('hh-1');
  });

  it('cycle yearly → recurring interval year', async () => {
    const fetchMock = mockCreateFlow();
    vi.stubGlobal('fetch', fetchMock);

    await new StripeProvider('sk_test').createSubscription({
      ...params,
      cycle: 'yearly',
      priceCents: 2900,
    });

    const map = new Map(parseFormBody((fetchMock.mock.calls[1]![1] as RequestInit).body as string));
    expect(map.get('items[0][price_data][recurring][interval]')).toBe('year');
    expect(map.get('items[0][price_data][unit_amount]')).toBe('2900');
  });

  it('cpfCnpj é ignorado (Stripe não tem campo) — não aparece em nenhum corpo', async () => {
    const fetchMock = mockCreateFlow();
    vi.stubGlobal('fetch', fetchMock);

    await new StripeProvider('sk_test').createSubscription(params);

    for (const call of fetchMock.mock.calls) {
      const body = (call[1] as RequestInit).body as string;
      expect(body).not.toContain('12345678900');
      expect(body.toLowerCase()).not.toContain('cpf');
    }
  });

  it('toda chamada leva Authorization Bearer e Content-Type form-urlencoded', async () => {
    const fetchMock = mockCreateFlow();
    vi.stubGlobal('fetch', fetchMock);

    await new StripeProvider('sk_minha_chave').createSubscription(params);

    for (const call of fetchMock.mock.calls) {
      const [, init] = call;
      expect((init as RequestInit).headers).toMatchObject({
        Authorization: 'Bearer sk_minha_chave',
        'Content-Type': 'application/x-www-form-urlencoded',
      });
    }
  });

  it('retorna externalId, externalCustomerId e checkoutUrl (hosted_invoice_url)', async () => {
    const fetchMock = mockCreateFlow();
    vi.stubGlobal('fetch', fetchMock);

    const res = await new StripeProvider('sk_test').createSubscription(params);

    expect(res).toEqual({
      externalId: 'sub_1',
      externalCustomerId: 'cus_1',
      checkoutUrl: 'https://stripe/pay/1',
    });
  });

  it('latest_invoice sem hosted_invoice_url → checkoutUrl vazio (fallback)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'cus_1' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'sub_1', latest_invoice: {} }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const res = await new StripeProvider('sk_test').createSubscription(params);
    expect(res.checkoutUrl).toBe('');
  });

  it('resposta não-2xx → lança stripe_<status>', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 402 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new StripeProvider('sk_test').createSubscription(params)).rejects.toThrow(
      /stripe_402/,
    );
  });
});

describe('StripeProvider.cancelSubscription', () => {
  it('DELETE 2xx resolve', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new StripeProvider('sk_test').cancelSubscription('sub_1')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/v1/subscriptions/sub_1`);
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('DELETE 404 é tratado como ok (idempotente)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(new StripeProvider('sk_test').cancelSubscription('sub_1')).resolves.toBeUndefined();
  });

  it('DELETE 500 lança', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    await expect(new StripeProvider('sk_test').cancelSubscription('sub_1')).rejects.toThrow(
      /stripe_500/,
    );
  });
});

// ---- assinatura do webhook ----

const WH_SECRET = 'whsec_test_secret';

/** Assina um payload como o Stripe faria: header `t=<ts>,v1=<hmac hex>`. */
function signPayload(payload: string, secret: string, ts: number): string {
  const hmac = createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
  return `t=${ts},v1=${hmac}`;
}

function whReq(payload: string, signature: string | null): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['stripe-signature'] = signature;
  return new Request('http://x/webhooks/stripe', { method: 'POST', headers, body: payload });
}

describe('verifyStripeSignature', () => {
  it('assinatura válida (fresca) → true', () => {
    const payload = '{"id":"evt_1"}';
    const now = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature(WH_SECRET, signPayload(payload, WH_SECRET, now), payload)).toBe(
      true,
    );
  });

  it('assinatura com hmac errado → false', () => {
    const payload = '{"id":"evt_1"}';
    const now = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature(WH_SECRET, `t=${now},v1=deadbeef`, payload)).toBe(false);
  });

  it('timestamp velho (>5min) → false (replay guard)', () => {
    const payload = '{"id":"evt_1"}';
    const old = Math.floor(Date.now() / 1000) - 600;
    // assina corretamente, mas com timestamp antigo → tolerância reprova
    expect(verifyStripeSignature(WH_SECRET, signPayload(payload, WH_SECRET, old), payload)).toBe(
      false,
    );
  });

  it('header ausente → false', () => {
    expect(verifyStripeSignature(WH_SECRET, null, '{}')).toBe(false);
  });

  it('header sem v1 → false', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature(WH_SECRET, `t=${now}`, '{}')).toBe(false);
  });
});

describe('StripeProvider.verifyAndParseWebhook (auth + mapping)', () => {
  const provider = () => new StripeProvider('sk_test');
  const now = () => Math.floor(Date.now() / 1000);

  const eventJson = (type: string, obj: Record<string, unknown>, id = 'evt_1') =>
    JSON.stringify({ id, type, data: { object: obj } });

  it('assinatura inválida → null sem efeito', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
    const payload = eventJson('invoice.paid', { subscription: 'sub_1' });
    const evt = await provider().verifyAndParseWebhook(whReq(payload, `t=${now()},v1=bad`));
    expect(evt).toBeNull();
  });

  it('timestamp velho → null', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
    const payload = eventJson('invoice.paid', { subscription: 'sub_1' });
    const old = now() - 600;
    const evt = await provider().verifyAndParseWebhook(
      whReq(payload, signPayload(payload, WH_SECRET, old)),
    );
    expect(evt).toBeNull();
  });

  it('sem STRIPE_WEBHOOK_SECRET no env → aceita (dev) e parseia', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const payload = eventJson('invoice.paid', { subscription: 'sub_1' });
    const evt = await provider().verifyAndParseWebhook(whReq(payload, null));
    expect(evt?.type).toBe('payment_confirmed');
  });

  it('invoice.paid → payment_confirmed (externalId de invoice.subscription)', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
    const payload = eventJson('invoice.paid', { subscription: 'sub_9' }, 'evt_9');
    const evt = await provider().verifyAndParseWebhook(
      whReq(payload, signPayload(payload, WH_SECRET, now())),
    );
    expect(evt).toMatchObject({
      eventId: 'evt_9',
      type: 'payment_confirmed',
      externalSubscriptionId: 'sub_9',
    });
  });

  it('invoice.payment_succeeded → payment_confirmed', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
    const payload = eventJson('invoice.payment_succeeded', { subscription: 'sub_1' });
    const evt = await provider().verifyAndParseWebhook(
      whReq(payload, signPayload(payload, WH_SECRET, now())),
    );
    expect(evt?.type).toBe('payment_confirmed');
  });

  it('invoice.payment_failed → payment_overdue', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
    const payload = eventJson('invoice.payment_failed', { subscription: 'sub_1' });
    const evt = await provider().verifyAndParseWebhook(
      whReq(payload, signPayload(payload, WH_SECRET, now())),
    );
    expect(evt?.type).toBe('payment_overdue');
  });

  it('customer.subscription.deleted → subscription_deleted (externalId de object.id)', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
    const payload = eventJson('customer.subscription.deleted', { id: 'sub_7' });
    const evt = await provider().verifyAndParseWebhook(
      whReq(payload, signPayload(payload, WH_SECRET, now())),
    );
    expect(evt).toMatchObject({ type: 'subscription_deleted', externalSubscriptionId: 'sub_7' });
  });

  it('charge.refunded → payment_refunded (externalId de metadata.subscriptionId)', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
    const payload = eventJson('charge.refunded', { metadata: { subscriptionId: 'sub_5' } });
    const evt = await provider().verifyAndParseWebhook(
      whReq(payload, signPayload(payload, WH_SECRET, now())),
    );
    expect(evt).toMatchObject({ type: 'payment_refunded', externalSubscriptionId: 'sub_5' });
  });

  it('charge.dispute.created → chargeback', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
    const payload = eventJson('charge.dispute.created', { metadata: { subscriptionId: 'sub_5' } });
    const evt = await provider().verifyAndParseWebhook(
      whReq(payload, signPayload(payload, WH_SECRET, now())),
    );
    expect(evt?.type).toBe('chargeback');
  });

  it('evento desconhecido → null (assinatura válida; handler responde 200)', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
    const payload = eventJson('invoice.created', { subscription: 'sub_1' });
    const evt = await provider().verifyAndParseWebhook(
      whReq(payload, signPayload(payload, WH_SECRET, now())),
    );
    expect(evt).toBeNull();
  });

  it('evento mapeado mas sem subscription correlacionável → null', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
    const payload = eventJson('invoice.paid', {});
    const evt = await provider().verifyAndParseWebhook(
      whReq(payload, signPayload(payload, WH_SECRET, now())),
    );
    expect(evt).toBeNull();
  });

  it('payload não-JSON (mas assinatura válida) → null', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
    const payload = 'not json{';
    const evt = await provider().verifyAndParseWebhook(
      whReq(payload, signPayload(payload, WH_SECRET, now())),
    );
    expect(evt).toBeNull();
  });
});
