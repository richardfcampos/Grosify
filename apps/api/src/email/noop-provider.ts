import type { EmailMessage, EmailProvider, EmailResult } from './types.js';

/**
 * Adaptador no-op: usado quando não há provider configurado (dev / env-gate),
 * igual ao padrão do R2. Loga o que SERIA enviado em vez de mandar, mantendo o
 * app funcional sem credencial. Nunca lança — falha de email não derruba o fluxo.
 */
export class NoopEmailProvider implements EmailProvider {
  readonly name = 'noop';

  async send(message: EmailMessage): Promise<EmailResult> {
    console.warn(
      `[email:noop] envio desabilitado (sem RESEND_API_KEY). to=${message.to} subject=${JSON.stringify(message.subject)}`,
    );
    return { id: null, provider: this.name, delivered: false };
  }
}
