/**
 * Porta de envio de email (Dependency Inversion).
 *
 *   ┌────────────────────┐      depende de       ┌──────────────────┐
 *   │ auth / convites /  │ ───────────────────▶  │  EmailProvider   │  (porta, esta interface)
 *   │ qualquer feature   │   sendEmail(msg)      │  + EmailMessage  │
 *   └────────────────────┘                       └────────┬─────────┘
 *                                                 implementa │
 *                              ┌──────────────────┬─────────┴──────────┐
 *                              ▼                  ▼                    ▼
 *                        ResendProvider     NoopProvider        (futuro: SES/SMTP…)
 *
 * Nenhum arquivo da aplicação importa um provider concreto — todos usam `sendEmail`
 * (que delega pra porta). Trocar de serviço = implementar EmailProvider + registrar
 * no factory (./index.ts). Mais nada muda.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailResult {
  /** id da mensagem no provider, quando aplicável */
  id: string | null;
  /** quem tratou (resend | noop | …) — pra log/observabilidade */
  provider: string;
  /** true quando realmente saiu; false = no-op/desabilitado (env-gate) */
  delivered: boolean;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
}
