import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  billingProviderFor,
  getBillingProvider,
  resetBillingProviders,
  setBillingProvider,
} from './index.js';
import { StripeProvider } from './stripe-provider.js';
import type { PaymentProvider } from './types.js';

afterEach(() => {
  resetBillingProviders();
  vi.restoreAllMocks();
});

describe('billingProviderFor (factory / env-gate por moeda)', () => {
  it('BRL sem ASAAS_API_KEY → null (rota → 501)', () => {
    expect(billingProviderFor('BRL', {})).toBeNull();
  });

  it('BRL com ASAAS_API_KEY → asaas', () => {
    const p = billingProviderFor('BRL', { ASAAS_API_KEY: 'k' });
    expect(p?.name).toBe('asaas');
  });

  it('USD sem STRIPE_SECRET_KEY → null (stub sem credencial → 501)', () => {
    expect(billingProviderFor('USD', { ASAAS_API_KEY: 'k' })).toBeNull();
  });

  it('USD com STRIPE_SECRET_KEY → stripe', () => {
    const p = billingProviderFor('USD', { STRIPE_SECRET_KEY: 'sk' });
    expect(p?.name).toBe('stripe');
  });

  it('moeda ≠ BRL nunca roteia pro Asaas mesmo com ASAAS_API_KEY', () => {
    expect(billingProviderFor('USD', { ASAAS_API_KEY: 'k' })).toBeNull();
  });
});

describe('StripeProvider (adapter real)', () => {
  it('name é stripe', () => {
    expect(new StripeProvider('sk_test').name).toBe('stripe');
  });

  it('factory USD com STRIPE_SECRET_KEY entrega uma instância utilizável (não o stub que lançava)', () => {
    const p = billingProviderFor('USD', { STRIPE_SECRET_KEY: 'sk_test' });
    expect(p).toBeInstanceOf(StripeProvider);
    expect(p?.name).toBe('stripe');
  });
});

describe('getBillingProvider (injeção pra testes)', () => {
  it('override registrado vence a factory na mesma moeda', () => {
    const fake: PaymentProvider = {
      name: 'asaas',
      createSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
      verifyAndParseWebhook: vi.fn(),
    };
    setBillingProvider('BRL', fake);
    expect(getBillingProvider('BRL', {})).toBe(fake);
  });

  it('sem override cai na factory (BRL sem env → null)', () => {
    expect(getBillingProvider('BRL', {})).toBeNull();
  });

  it('reset remove o override', () => {
    const fake: PaymentProvider = {
      name: 'asaas',
      createSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
      verifyAndParseWebhook: vi.fn(),
    };
    setBillingProvider('BRL', fake);
    resetBillingProviders();
    expect(getBillingProvider('BRL', {})).toBeNull();
  });
});
