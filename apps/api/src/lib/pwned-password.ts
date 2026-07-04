import { createHash } from 'node:crypto';

/**
 * Checa se a senha apareceu em vazamentos via HIBP com k-anonymity:
 * envia só os 5 primeiros chars do SHA-1 — nunca a senha nem o hash completo.
 * Fail-open: erro/timeout da API externa NÃO bloqueia cadastro/reset (segurança
 * não pode depender de terceiro estar de pé).
 */
export async function isPwnedPassword(password: string): Promise<boolean> {
  if (!password) return false;
  try {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false; // fail-open
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [hashSuffix, count] = line.trim().split(':');
      if (hashSuffix === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return false; // fail-open (rede/timeout)
  }
}
