import { createRequire } from 'node:module';

// Lista mantida (open-source) carregada via require — o pacote expõe um JSON (array)
// como `main`, então createRequire evita fricção de import-assertion no ESM.
const requireCjs = createRequire(import.meta.url);
const domains = requireCjs('disposable-email-domains') as string[];
const BLOCKED = new Set(domains.map((d) => d.toLowerCase()));

/** true se o domínio do e-mail é de um provedor descartável/temporário. */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.trim().toLowerCase();
  return domain ? BLOCKED.has(domain) : false;
}
