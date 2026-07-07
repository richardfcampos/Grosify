import { describe, expect, it } from 'vitest';
import { couponErrorKey } from './coupon-redeem-form.js';

// Mapa de erro do resgate → chave de tradução. Espelha o error map da rota (CUP error map)
// e o padrão inline do checkout: código do body vira errors.<code>; casos sem body caem no genérico.
describe('couponErrorKey', () => {
  it('429 → errors.rate_limited independente do body', () => {
    expect(couponErrorKey(429, {})).toBe('errors.rate_limited');
    expect(couponErrorKey(429, { error: 'rate_limited' })).toBe('errors.rate_limited');
  });

  it('mapeia cada código tipado da rota', () => {
    expect(couponErrorKey(404, { error: 'coupon_invalid' })).toBe('errors.coupon_invalid');
    expect(couponErrorKey(410, { error: 'coupon_exhausted' })).toBe('errors.coupon_exhausted');
    expect(couponErrorKey(410, { error: 'coupon_expired' })).toBe('errors.coupon_expired');
    expect(couponErrorKey(409, { error: 'coupon_already_redeemed' })).toBe(
      'errors.coupon_already_redeemed',
    );
    expect(couponErrorKey(403, { error: 'forbidden' })).toBe('errors.forbidden');
    expect(couponErrorKey(403, { error: 'read_only' })).toBe('errors.read_only');
  });

  it('sem código no body → errors.generic', () => {
    expect(couponErrorKey(500, {})).toBe('errors.generic');
  });
});
