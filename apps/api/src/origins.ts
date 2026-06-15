/**
 * Origens permitidas (CORS + Better Auth).
 * WEB_ORIGIN aceita lista separada por vírgula (ex.: prod + staging).
 * Em dev, qualquer localhost/127.0.0.1 (qualquer porta) é liberado.
 */
const configured = (process.env.WEB_ORIGIN ?? 'http://localhost:5174,http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isDev = process.env.NODE_ENV !== 'production';
const localhostRe = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (configured.includes(origin)) return true;
  if (isDev && localhostRe.test(origin)) return true;
  return false;
}

/** Lista pra Better Auth trustedOrigins (inclui variantes localhost em dev). */
export const trustedOrigins = isDev
  ? Array.from(
      new Set([
        ...configured,
        'http://localhost:5174',
        'http://localhost:5173',
        'http://127.0.0.1:5174',
        'http://127.0.0.1:5173',
      ]),
    )
  : configured;
