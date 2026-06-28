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

/** Origem primária do web — base dos links montados no servidor (ex.: convite por e-mail). */
export const webBaseUrl = configured[0] ?? 'http://localhost:5174';

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (configured.includes(origin)) return true;
  if (isDev && localhostRe.test(origin)) return true;
  return false;
}

/**
 * Lista pra Better Auth trustedOrigins. Em dev, wildcard de porta pra localhost/
 * 127.0.0.1 (Vite pode subir em 5175+ se 5174 estiver ocupada). Better Auth suporta
 * padrões com `*` via wildcardMatch.
 */
export const trustedOrigins = isDev
  ? Array.from(new Set([...configured, 'http://localhost:*', 'http://127.0.0.1:*']))
  : configured;
