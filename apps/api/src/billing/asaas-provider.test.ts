import { afterEach, describe, expect, it, vi } from 'vitest';
import { AsaasProvider } from './asaas-provider.js';
import type { CreateSubscriptionParams } from './types.js';

const BASE = 'https://api-sandbox.asaas.com/v3';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.ASAAS_WEBHOOK_TOKEN;
});

const params: CreateSubscriptionParams = {
  householdId: 'hh-1',
  cycle: 'monthly',
  currency: 'BRL',
  priceCents: 1290,
  customer: { name: 'Ana', email: 'ana@x.com', cpfCnpj: '12345678900' },
};

/** Mock que responde customer, subscription e payments em sequência. */
function mockCreateFlow() {
  return vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'cus_1' }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'sub_1' }), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ invoiceUrl: 'https://asaas/pay/1' }] }), {
        status: 200,
      }),
    );
}

describe('AsaasProvider.createSubscription', () => {
  it('converte cents→reais no value enviado (1290 → 12.90, nunca 1290)', async () => {
    const fetchMock = mockCreateFlow();
    vi.stubGlobal('fetch', fetchMock);

    await new AsaasProvider('key').createSubscription(params);

    // 2ª chamada é POST /subscriptions — inspeciona o value do corpo
    const [, subInit] = fetchMock.mock.calls[1]!;
    const sentBody = JSON.parse((subInit as RequestInit).body as string);
    expect(sentBody.value).toBe(12.9);
    expect(sentBody.value.toFixed(2)).toBe('12.90');
    expect(sentBody.value).not.toBe(1290);
  });

  it('POST /subscriptions manda billingType UNDEFINED, cycle MONTHLY e externalReference', async () => {
    const fetchMock = mockCreateFlow();
    vi.stubGlobal('fetch', fetchMock);

    await new AsaasProvider('key').createSubscription(params);

    const [subUrl, subInit] = fetchMock.mock.calls[1]!;
    expect(subUrl).toBe(`${BASE}/subscriptions`);
    const sentBody = JSON.parse((subInit as RequestInit).body as string);
    expect(sentBody.billingType).toBe('UNDEFINED');
    expect(sentBody.cycle).toBe('MONTHLY');
    expect(sentBody.externalReference).toBe('hh-1');
    expect(sentBody.customer).toBe('cus_1');
  });

  it('cycle yearly → YEARLY', async () => {
    const fetchMock = mockCreateFlow();
    vi.stubGlobal('fetch', fetchMock);

    await new AsaasProvider('key').createSubscription({ ...params, cycle: 'yearly' });

    const [, subInit] = fetchMock.mock.calls[1]!;
    const sentBody = JSON.parse((subInit as RequestInit).body as string);
    expect(sentBody.cycle).toBe('YEARLY');
  });

  it('toda chamada leva headers access_token, Content-Type e User-Agent', async () => {
    const fetchMock = mockCreateFlow();
    vi.stubGlobal('fetch', fetchMock);

    await new AsaasProvider('minha-chave').createSubscription(params);

    for (const call of fetchMock.mock.calls) {
      const [, init] = call;
      expect((init as RequestInit).headers).toMatchObject({
        access_token: 'minha-chave',
        'Content-Type': 'application/json',
        'User-Agent': 'Grosify',
      });
    }
  });

  it('retorna externalId, externalCustomerId e checkoutUrl (invoiceUrl da 1ª cobrança)', async () => {
    const fetchMock = mockCreateFlow();
    vi.stubGlobal('fetch', fetchMock);

    const res = await new AsaasProvider('key').createSubscription(params);

    expect(res).toEqual({
      externalId: 'sub_1',
      externalCustomerId: 'cus_1',
      checkoutUrl: 'https://asaas/pay/1',
    });
    // 3ª chamada é GET /subscriptions/sub_1/payments
    expect(fetchMock.mock.calls[2]![0]).toBe(`${BASE}/subscriptions/sub_1/payments`);
  });

  it('respeita ASAAS_BASE_URL customizado', async () => {
    const fetchMock = mockCreateFlow();
    vi.stubGlobal('fetch', fetchMock);

    await new AsaasProvider('key', 'https://api.asaas.com/v3').createSubscription(params);

    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.asaas.com/v3/customers');
  });
});

describe('AsaasProvider.cancelSubscription', () => {
  it('DELETE 2xx resolve', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new AsaasProvider('key').cancelSubscription('sub_1')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/subscriptions/sub_1`);
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('DELETE 404 é tratado como ok (idempotente)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(new AsaasProvider('key').cancelSubscription('sub_1')).resolves.toBeUndefined();
  });

  it('DELETE 500 lança', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    await expect(new AsaasProvider('key').cancelSubscription('sub_1')).rejects.toThrow(/asaas_500/);
  });
});

describe('AsaasProvider.verifyAndParseWebhook (auth + mapping)', () => {
  const req = (body: unknown, token?: string) =>
    new Request('http://x/webhooks/asaas', {
      method: 'POST',
      headers: token ? { 'asaas-access-token': token, 'content-type': 'application/json' } : {},
      body: JSON.stringify(body),
    });

  it('token errado → null sem efeito', async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = 'segredo';
    const evt = await new AsaasProvider('key').verifyAndParseWebhook(
      req({ id: 'evt_1', event: 'PAYMENT_CONFIRMED', payment: { subscription: 'sub_1' } }, 'errado'),
    );
    expect(evt).toBeNull();
  });

  it('sem token env → aceita (dev) e parseia', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const evt = await new AsaasProvider('key').verifyAndParseWebhook(
      req({ id: 'evt_1', event: 'PAYMENT_CONFIRMED', payment: { subscription: 'sub_1' } }),
    );
    expect(evt?.type).toBe('payment_confirmed');
  });

  it('PAYMENT_CONFIRMED → payment_confirmed com eventId e externalSubscriptionId', async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = 't';
    const evt = await new AsaasProvider('key').verifyAndParseWebhook(
      req({ id: 'evt_9', event: 'PAYMENT_CONFIRMED', payment: { subscription: 'sub_9' } }, 't'),
    );
    expect(evt).toMatchObject({
      eventId: 'evt_9',
      type: 'payment_confirmed',
      externalSubscriptionId: 'sub_9',
    });
  });

  it('PAYMENT_RECEIVED → payment_confirmed', async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = 't';
    const evt = await new AsaasProvider('key').verifyAndParseWebhook(
      req({ id: 'e', event: 'PAYMENT_RECEIVED', payment: { subscription: 'sub_1' } }, 't'),
    );
    expect(evt?.type).toBe('payment_confirmed');
  });

  it('PAYMENT_OVERDUE → payment_overdue', async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = 't';
    const evt = await new AsaasProvider('key').verifyAndParseWebhook(
      req({ id: 'e', event: 'PAYMENT_OVERDUE', payment: { subscription: 'sub_1' } }, 't'),
    );
    expect(evt?.type).toBe('payment_overdue');
  });

  it('PAYMENT_REFUNDED → payment_refunded', async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = 't';
    const evt = await new AsaasProvider('key').verifyAndParseWebhook(
      req({ id: 'e', event: 'PAYMENT_REFUNDED', payment: { subscription: 'sub_1' } }, 't'),
    );
    expect(evt?.type).toBe('payment_refunded');
  });

  it('PAYMENT_CHARGEBACK_REQUESTED → chargeback', async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = 't';
    const evt = await new AsaasProvider('key').verifyAndParseWebhook(
      req({ id: 'e', event: 'PAYMENT_CHARGEBACK_REQUESTED', payment: { subscription: 'sub_1' } }, 't'),
    );
    expect(evt?.type).toBe('chargeback');
  });

  it('SUBSCRIPTION_DELETED → subscription_deleted (externalId de subscription.id)', async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = 't';
    const evt = await new AsaasProvider('key').verifyAndParseWebhook(
      req({ id: 'e', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_7' } }, 't'),
    );
    expect(evt).toMatchObject({ type: 'subscription_deleted', externalSubscriptionId: 'sub_7' });
  });

  it('SUBSCRIPTION_INACTIVATED → subscription_deleted', async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = 't';
    const evt = await new AsaasProvider('key').verifyAndParseWebhook(
      req({ id: 'e', event: 'SUBSCRIPTION_INACTIVATED', subscription: { id: 'sub_7' } }, 't'),
    );
    expect(evt?.type).toBe('subscription_deleted');
  });

  it('evento desconhecido → null (mas token válido; handler responde 200)', async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = 't';
    const evt = await new AsaasProvider('key').verifyAndParseWebhook(
      req({ id: 'e', event: 'PAYMENT_CREATED', payment: { subscription: 'sub_1' } }, 't'),
    );
    expect(evt).toBeNull();
  });
});
