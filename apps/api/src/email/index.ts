import { NoopEmailProvider } from './noop-provider.js';
import { ResendEmailProvider } from './resend-provider.js';
import type { EmailMessage, EmailProvider, EmailResult } from './types.js';

export type { EmailMessage, EmailProvider, EmailResult } from './types.js';
export { renderResetEmail, renderVerificationEmail } from './templates.js';
export { SUPPORTED_EMAIL_LOCALES, resolveLocale, type EmailLocale } from './locales.js';

type Env = Record<string, string | undefined>;

/**
 * Factory — ÚNICO lugar que conhece providers concretos. Escolhe o adaptador por env:
 *   EMAIL_PROVIDER = resend | noop   (opcional; default: resend se houver chave, senão noop)
 *   RESEND_API_KEY, EMAIL_FROM
 *
 * Pra plugar um serviço novo (SES, SMTP, Postmark…): implemente `EmailProvider` num
 * arquivo `*-provider.ts` e registre um `case` aqui. Nenhum caller muda.
 */
export function createEmailProvider(env: Env = process.env): EmailProvider {
  const explicit = env.EMAIL_PROVIDER?.toLowerCase();
  const from = env.EMAIL_FROM ?? 'Grosify <no-reply@grosify.app>';
  const key = env.RESEND_API_KEY;

  if (explicit === 'noop') return new NoopEmailProvider();

  if (explicit === 'resend' || (!explicit && key)) {
    if (!key) {
      console.warn('[email] EMAIL_PROVIDER=resend mas RESEND_API_KEY ausente — caindo no no-op.');
      return new NoopEmailProvider();
    }
    return new ResendEmailProvider(key, from);
  }

  return new NoopEmailProvider();
}

// Singleton do app + injeção pra testes. Callers dependem só de `sendEmail`/da porta.
let provider: EmailProvider = createEmailProvider();

export function setEmailProvider(p: EmailProvider): void {
  provider = p;
}

export function getEmailProvider(): EmailProvider {
  return provider;
}

export function sendEmail(message: EmailMessage): Promise<EmailResult> {
  return provider.send(message);
}
