import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmailProvider, sendEmail, setEmailProvider } from './index.js';
import { resolveLocale } from './locales.js';
import { NoopEmailProvider } from './noop-provider.js';
import { ResendEmailProvider } from './resend-provider.js';
import type { EmailProvider } from './types.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createEmailProvider (factory / env-gate)', () => {
  it('sem RESEND_API_KEY → no-op', () => {
    expect(createEmailProvider({}).name).toBe('noop');
  });

  it('com RESEND_API_KEY → resend', () => {
    expect(createEmailProvider({ RESEND_API_KEY: 'k' }).name).toBe('resend');
  });

  it('EMAIL_PROVIDER=noop ignora a chave', () => {
    expect(createEmailProvider({ EMAIL_PROVIDER: 'noop', RESEND_API_KEY: 'k' }).name).toBe('noop');
  });

  it('EMAIL_PROVIDER=resend sem chave → cai no no-op', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(createEmailProvider({ EMAIL_PROVIDER: 'resend' }).name).toBe('noop');
  });
});

describe('NoopEmailProvider', () => {
  it('não envia e nunca lança', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await new NoopEmailProvider().send({ to: 'a@b.c', subject: 's', html: 'h', text: 't' });
    expect(res).toEqual({ id: null, provider: 'noop', delivered: false });
  });
});

describe('ResendEmailProvider', () => {
  const msg = { to: 'a@b.c', subject: 's', html: '<p>h</p>', text: 't' };

  it('200 → delivered com id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await new ResendEmailProvider('key', 'from@grosify.app').send(msg);
    expect(res).toEqual({ id: 'em_1', provider: 'resend', delivered: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer key' });
  });

  it('5xx transitório → retry e sucesso', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'em_2' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await new ResendEmailProvider('key', 'from@grosify.app').send(msg);
    expect(res.delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('4xx não-transitório → lança sem retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('domínio não verificado', { status: 422 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new ResendEmailProvider('key', 'from@grosify.app').send(msg)).rejects.toThrow(
      /resend_rejected_422/,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('sendEmail (injeção de provider)', () => {
  it('delega pro provider injetado', async () => {
    const fake: EmailProvider = {
      name: 'fake',
      send: vi.fn().mockResolvedValue({ id: 'x', provider: 'fake', delivered: true }),
    };
    setEmailProvider(fake);
    try {
      const res = await sendEmail({ to: 'a@b.c', subject: 's', html: 'h', text: 't' });
      expect(res.provider).toBe('fake');
      expect(fake.send).toHaveBeenCalledOnce();
    } finally {
      setEmailProvider(createEmailProvider({})); // restaura no-op
    }
  });
});

describe('resolveLocale', () => {
  const req = (al: string) => new Request('http://x', { headers: { 'accept-language': al } });

  it('escolhe o idioma suportado do header', () => {
    expect(resolveLocale(req('es-ES,es;q=0.9,en;q=0.8'))).toBe('es');
    expect(resolveLocale(req('de'))).toBe('de');
  });

  it('idioma não suportado → fallback pt', () => {
    expect(resolveLocale(req('ja-JP,ja'))).toBe('pt');
  });

  it('sem request → pt', () => {
    expect(resolveLocale(undefined)).toBe('pt');
  });
});
