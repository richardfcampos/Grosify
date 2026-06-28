import type { EmailMessage, EmailProvider, EmailResult } from './types.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const MAX_ATTEMPTS = 3;

/**
 * Adaptador Resend — REST via fetch (sem SDK, pra manter as deps mínimas).
 * Retry 2x com backoff em falha transitória (rede, 429, 5xx). Rejeição 4xx
 * (ex.: domínio `from` não verificado) não tem retry — propaga na hora.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    const body = JSON.stringify({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await delay(250 * attempt);
      try {
        const res = await fetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
        });

        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`resend_transient_${res.status}`);
          continue; // transitório → retry
        }
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          // 4xx não-transitório → não adianta retry
          throw new Error(`resend_rejected_${res.status}: ${detail.slice(0, 200)}`);
        }

        const json = (await res.json().catch(() => ({}))) as { id?: string };
        return { id: json.id ?? null, provider: this.name, delivered: true };
      } catch (err) {
        // rejeição explícita (4xx) propaga; erro de rede cai no retry
        if (err instanceof Error && err.message.startsWith('resend_rejected_')) throw err;
        lastErr = err;
      }
    }
    throw new Error(`resend_failed_after_retries: ${String(lastErr)}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
