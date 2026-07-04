/** Idiomas suportados nos emails (espelha os locales do app web). */
export const SUPPORTED_EMAIL_LOCALES = ['pt', 'en', 'es', 'it', 'de', 'fr'] as const;
export type EmailLocale = (typeof SUPPORTED_EMAIL_LOCALES)[number];

/**
 * Resolve o idioma do email pelo Accept-Language da requisição (fallback `pt`).
 * NOTA: usa o idioma do browser. Uma preferência persistida (`user.locale`) é um
 * refino futuro — registrado nos TODOs do plano.
 */
export function resolveLocale(request?: Request): EmailLocale {
  const header = request?.headers?.get('accept-language') ?? '';
  for (const part of header.split(',')) {
    const code = part.trim().split(';')[0]?.split('-')[0]?.toLowerCase();
    if (code && (SUPPORTED_EMAIL_LOCALES as readonly string[]).includes(code)) {
      return code as EmailLocale;
    }
  }
  return 'pt';
}
