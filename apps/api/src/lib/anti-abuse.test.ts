import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDisposableEmail } from './disposable-email.js';
import { isPwnedPassword } from './pwned-password.js';
import { turnstileEnabled, verifyTurnstile } from './turnstile.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.TURNSTILE_SECRET;
});

describe('isDisposableEmail', () => {
  it('bloqueia domínio descartável conhecido', () => {
    expect(isDisposableEmail('spam@mailinator.com')).toBe(true);
  });
  it('permite provedor normal', () => {
    expect(isDisposableEmail('ana@gmail.com')).toBe(false);
  });
  it('e-mail sem domínio → false', () => {
    expect(isDisposableEmail('semarroba')).toBe(false);
  });
});

describe('isPwnedPassword (HIBP k-anonymity)', () => {
  // SHA1('password') = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  const SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';

  it('senha vazada → true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(`${SUFFIX}:99999\nAAAA:1`, { status: 200 })),
    );
    expect(await isPwnedPassword('password')).toBe(true);
  });

  it('senha não listada → false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('0000:1\nBBBB:2', { status: 200 })));
    expect(await isPwnedPassword('password')).toBe(false);
  });

  it('API fora do ar → fail-open (false)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await isPwnedPassword('password')).toBe(false);
  });

  it('senha vazia → false sem chamar a API', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await isPwnedPassword('')).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('verifyTurnstile (env-gated)', () => {
  it('sem TURNSTILE_SECRET → desligado (passthrough true)', async () => {
    expect(turnstileEnabled()).toBe(false);
    expect(await verifyTurnstile(undefined)).toBe(true);
  });

  it('ligado + sem token → false', async () => {
    process.env.TURNSTILE_SECRET = 's';
    expect(await verifyTurnstile(undefined)).toBe(false);
  });

  it('ligado + token válido → true', async () => {
    process.env.TURNSTILE_SECRET = 's';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })));
    expect(await verifyTurnstile('tok')).toBe(true);
  });

  it('ligado + token inválido → false', async () => {
    process.env.TURNSTILE_SECRET = 's';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 })));
    expect(await verifyTurnstile('tok')).toBe(false);
  });
});
