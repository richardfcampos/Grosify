import type { Uf } from '@grosify/shared';
import { NfceLookupError } from '../types.js';

/**
 * Fetch do HTML de um portal SEFAZ — molde do turnstile.ts (timeout + try/catch).
 *
 * Usa User-Agent de browser real: vários portais devolvem 403 pra clientes sem UA
 * de navegador (WAF). SEM headless browser — só GET + leitura do HTML renderizado
 * no servidor (a página do QR já vem com os itens, por especificação ENCAT).
 *
 * Resiliência: portais SEFAZ caem/lentificam em pico. Um 5xx/timeout dá direito a 1
 * retry com backoff curto (absorve indisponibilidade transitória sem virar retry
 * infinito que agrava o bloqueio de IP). Esgotado o retry → `nfce_portal_error`
 * tipado (a rota mapeia pra 504, SEM consumir quota).
 *
 * O corpo cru NUNCA é logado nem incluído no erro (pode conter CPF do consumidor).
 */

/** UA de um Chrome recente — portais checam por navegador, não por bot. */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Portais SEFAZ podem ser lentos em pico (5-10s documentado) — teto conservador. */
const PORTAL_TIMEOUT_MS = 12_000;
/** Backoff curto entre a tentativa e o único retry (ms). */
const RETRY_BACKOFF_MS = 400;

/** Uma tentativa de fetch; devolve o HTML ou lança NfceLookupError('nfce_portal_error'). */
async function attemptFetch(url: string, uf: Uf): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(PORTAL_TIMEOUT_MS),
    });
    if (!res.ok) {
      // HTTP≠200 (403 WAF, 5xx, redirect pra formulário) → portal indisponível.
      throw new NfceLookupError('nfce_portal_error', uf);
    }
    return await res.text();
  } catch (err) {
    if (err instanceof NfceLookupError) throw err;
    // Timeout/DNS/reset → portal_error tipado (sem vazar o erro cru).
    throw new NfceLookupError('nfce_portal_error', uf);
  }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Busca o HTML do portal com 1 retry em erro transitório. O caller (parser) recebe o
 * HTML já pronto pra parsear, ou um `nfce_portal_error` depois de esgotar o retry.
 */
export async function fetchPortalHtml(url: string, uf: Uf): Promise<string> {
  try {
    return await attemptFetch(url, uf);
  } catch (err) {
    if (!(err instanceof NfceLookupError)) throw err;
    // 1 retry com backoff curto — só pra portal_error (indisponibilidade transitória).
    await delay(RETRY_BACKOFF_MS);
    return attemptFetch(url, uf);
  }
}
