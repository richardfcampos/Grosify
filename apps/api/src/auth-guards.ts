import type { Context } from 'hono';
import { auth } from './auth.js';
import { checkLock, clearAttempts, recordFailure } from './lib/account-lockout.js';
import { isDisposableEmail } from './lib/disposable-email.js';
import { isPwnedPassword } from './lib/pwned-password.js';
import { verifyTurnstile } from './lib/turnstile.js';

/**
 * Wrappers Hono na frente das rotas do Better Auth (sign-up/sign-in/reset).
 * Rodam os controles anti-abuso ANTES do handler do Better Auth e reencaminham o
 * corpo intacto. Independente de internals de hook do Better Auth (escolha do eng-review).
 *
 *   request ─▶ [guard: turnstile · disposable · pwned · lockout] ─▶ auth.handler ─▶ response
 *                              │ falhou                                    │
 *                              ▼                                           ▼ (registra falha/limpa)
 *                         422/403/429                                  lockout state
 */

function clientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown'
  );
}

/** Lê o corpo uma vez (consome o stream) e reconstrói um Request pro Better Auth. */
async function readBody(c: Context): Promise<{ forward: Request; body: Record<string, unknown> }> {
  const raw = c.req.raw;
  const bodyText = await raw.text();
  let body: Record<string, unknown> = {};
  try {
    body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
  } catch {
    /* corpo inválido — deixa o Better Auth validar/reclamar */
  }
  const forward = new Request(raw.url, { method: raw.method, headers: raw.headers, body: bodyText });
  return { forward, body };
}

export async function authGuardSignup(c: Context): Promise<Response> {
  const { forward, body } = await readBody(c);
  const email = String(body.email ?? '').toLowerCase();
  const password = String(body.password ?? '');

  if (!(await verifyTurnstile(body.turnstileToken as string | undefined, clientIp(c)))) {
    return c.json({ message: 'captcha_failed', code: 'captcha_failed' }, 403);
  }
  if (email && isDisposableEmail(email)) {
    return c.json({ message: 'disposable_email', code: 'disposable_email' }, 422);
  }
  if (password && (await isPwnedPassword(password))) {
    return c.json({ message: 'pwned_password', code: 'pwned_password' }, 422);
  }
  return auth.handler(forward);
}

export async function authGuardReset(c: Context): Promise<Response> {
  const { forward, body } = await readBody(c);
  const newPassword = String(body.newPassword ?? '');
  if (newPassword && (await isPwnedPassword(newPassword))) {
    return c.json({ message: 'pwned_password', code: 'pwned_password' }, 422);
  }
  return auth.handler(forward);
}

export async function authGuardSignin(c: Context): Promise<Response> {
  const { forward, body } = await readBody(c);
  const email = String(body.email ?? '').toLowerCase();

  if (!(await verifyTurnstile(body.turnstileToken as string | undefined, clientIp(c)))) {
    return c.json({ message: 'captcha_failed', code: 'captcha_failed' }, 403);
  }
  if (email) {
    const lock = await checkLock(email);
    if (lock) {
      c.header('Retry-After', String(lock.retryAfterSec));
      return c.json({ message: 'account_locked', code: 'account_locked', retryAfterSec: lock.retryAfterSec }, 429);
    }
  }

  const res = await auth.handler(forward);
  if (email) {
    if (res.status === 401 || res.status === 403) await recordFailure(email);
    else if (res.status < 300) await clearAttempts(email);
  }
  return res;
}
