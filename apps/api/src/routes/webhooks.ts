import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { suppress } from '../lib/email-suppression.js';

/**
 * Verifica a assinatura Svix (formato usado pelo Resend).
 * Env-gated: sem RESEND_WEBHOOK_SECRET aceita (dev) — em prod, sempre verificar.
 */
function verifySvix(secret: string, headers: Headers, payload: string): boolean {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signature = headers.get('svix-signature');
  if (!id || !timestamp || !signature) return false;

  // tolerância de timestamp (5 min) — barra replay de payload antigo
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');

  // header pode trazer várias assinaturas: "v1,<sig> v1,<sig2>"
  for (const part of signature.split(' ')) {
    const sig = part.split(',')[1] ?? '';
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

interface ResendEvent {
  type?: string;
  data?: { to?: string | string[]; email?: string };
}

export const webhooksRoute = new Hono().post('/resend', async (c) => {
  const payload = await c.req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (secret) {
    if (!verifySvix(secret, c.req.raw.headers, payload)) {
      return c.json({ error: 'invalid_signature' }, 401);
    }
  } else {
    console.warn('[webhook:resend] RESEND_WEBHOOK_SECRET ausente — assinatura não verificada (dev).');
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(payload) as ResendEvent;
  } catch {
    return c.json({ error: 'bad_payload' }, 400);
  }

  const type = event.type ?? '';
  if (type.includes('bounced') || type.includes('complained')) {
    const reason = type.includes('complained') ? 'complaint' : 'bounce';
    const to = event.data?.to ?? event.data?.email;
    const emails = Array.isArray(to) ? to : to ? [to] : [];
    for (const e of emails) await suppress(e, reason);
  }

  return c.json({ ok: true });
});
