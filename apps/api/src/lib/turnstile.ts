/**
 * Verificação do Cloudflare Turnstile (anti-bô nos formulários de auth).
 *
 * ENV-GATED: sem `TURNSTILE_SECRET` o controle fica DESLIGADO (passthrough = sempre true),
 * igual ao padrão do R2. Quando a credencial do Cloudflare existir, basta setar o env e o
 * front mandar o token — nenhuma outra mudança de código.
 *
 * Fail-closed quando LIGADO: se a verificação não puder ser feita, bloqueia (segurança).
 */
export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET);
}

export async function verifyTurnstile(token: string | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true; // desligado (sem credencial)
  if (!token) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip && ip !== 'unknown') form.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false; // ligado + indisponível → bloqueia
  }
}
