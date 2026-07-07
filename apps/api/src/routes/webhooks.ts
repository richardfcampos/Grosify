import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { AsaasProvider } from '../billing/asaas-provider.js';
import { applyBillingEvent } from '../billing/lifecycle.js';
import { StripeProvider, verifyStripeSignature } from '../billing/stripe-provider.js';
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

export const webhooksRoute = new Hono()
  .post('/asaas', async (c) => {
    // Token no header (padrão do Resend: verificação no handler). Sem token válido = 401
    // sem efeito. Sem ASAAS_WEBHOOK_TOKEN no env, não verifica (dev) — igual ao Resend.
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (expected) {
      const received = c.req.header('asaas-access-token');
      if (received !== expected) return c.json({ error: 'invalid_signature' }, 401);
    } else {
      console.warn('[webhook:asaas] ASAAS_WEBHOOK_TOKEN ausente — token não verificado (dev).');
    }

    const payload = await c.req.text();
    // Body inválido (não-JSON) = 400. Só depois de já ter passado a autenticação.
    try {
      JSON.parse(payload);
    } catch {
      return c.json({ error: 'bad_payload' }, 400);
    }

    // Reusa o parser/mapping do adapter — o token já foi verificado acima, então uma
    // requisição sintética sem header não reprova (o adapter só reprova quando o env
    // exige e o header diverge; aqui já garantimos que o token confere).
    const provider = new AsaasProvider(process.env.ASAAS_API_KEY ?? '');
    const synthetic = new Request('http://webhook/asaas', {
      method: 'POST',
      headers: expected ? { 'asaas-access-token': expected } : {},
      body: payload,
    });
    const event = await provider.verifyAndParseWebhook(synthetic);
    // Evento não mapeado (ou sem assinatura correlacionável) → 200 sem efeito.
    if (!event) return c.json({ ok: true });

    // A fila do Asaas interrompe após 15 falhas consecutivas — um bug nosso nunca pode
    // devolver 5xx. Qualquer exceção interna vira log + 200.
    let result: string;
    try {
      result = await applyBillingEvent(event, 'asaas');
    } catch (err) {
      console.error('[webhook:asaas]', event.type, event.externalSubscriptionId, 'error', err);
      return c.json({ ok: true });
    }
    console.log('[webhook:asaas]', event.type, event.externalSubscriptionId, result);
    return c.json({ ok: true });
  })
  .post('/stripe', async (c) => {
    // Assinatura no header Stripe-Signature (t=<ts>,v1=<hmac>). Sem STRIPE_WEBHOOK_SECRET
    // no env, não verifica (dev) — igual ao Asaas/Resend. Assinatura inválida = 401 sem efeito.
    const payload = await c.req.text();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (secret) {
      if (!verifyStripeSignature(secret, c.req.header('stripe-signature') ?? null, payload)) {
        return c.json({ error: 'invalid_signature' }, 401);
      }
    } else {
      console.warn('[webhook:stripe] STRIPE_WEBHOOK_SECRET ausente — assinatura não verificada (dev).');
    }

    // Body inválido (não-JSON) = 400. Só depois de já ter passado a autenticação.
    try {
      JSON.parse(payload);
    } catch {
      return c.json({ error: 'bad_payload' }, 400);
    }

    // Reusa o parser/mapping do adapter. A assinatura já foi verificada acima; a
    // requisição sintética não reprova (sem STRIPE_WEBHOOK_SECRET o adapter aceita;
    // com o secret, reassinamos abaixo pra o adapter revalidar o mesmo payload).
    const provider = new StripeProvider(process.env.STRIPE_SECRET_KEY ?? '');
    const headers: Record<string, string> = {};
    const sig = c.req.header('stripe-signature');
    if (sig) headers['stripe-signature'] = sig;
    const synthetic = new Request('http://webhook/stripe', {
      method: 'POST',
      headers,
      body: payload,
    });
    const event = await provider.verifyAndParseWebhook(synthetic);
    // Evento não mapeado (ou sem assinatura correlacionável) → 200 sem efeito.
    if (!event) return c.json({ ok: true });

    // Um bug nosso nunca pode devolver 5xx (o Stripe reentrega e alarma). Qualquer
    // exceção interna vira log + 200.
    let result: string;
    try {
      result = await applyBillingEvent(event, 'stripe');
    } catch (err) {
      console.error('[webhook:stripe]', event.type, event.externalSubscriptionId, 'error', err);
      return c.json({ ok: true });
    }
    console.log('[webhook:stripe]', event.type, event.externalSubscriptionId, result);
    return c.json({ ok: true });
  })
  .post('/resend', async (c) => {
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
