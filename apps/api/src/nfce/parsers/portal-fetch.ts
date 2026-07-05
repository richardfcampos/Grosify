import type { Uf } from '@grosify/shared';
import { NfceLookupError } from '../types.js';

/**
 * Fetch do HTML de um portal SEFAZ — molde do turnstile.ts (timeout + try/catch).
 *
 * Usa User-Agent de browser real: vários portais devolvem 403 pra clientes sem UA
 * de navegador (WAF). SEM headless browser — só GET + leitura do HTML renderizado
 * no servidor (a página do QR já vem com os itens, por especificação ENCAT).
 *
 * Erros de rede/timeout/HTTP≠200 viram `nfce_portal_error` tipado (a rota mapeia
 * pra 504, sem consumir quota). O corpo cru NUNCA é logado (pode conter CPF).
 */

/** UA de um Chrome recente — portais checam por navegador, não por bot. */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Portais SEFAZ podem ser lentos em pico (5-10s documentado) — teto conservador. */
const PORTAL_TIMEOUT_MS = 12_000;

export async function fetchPortalHtml(url: string, uf: Uf): Promise<string> {
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
    // Repassa erro já tipado; qualquer outro (timeout/DNS/reset) vira portal_error.
    if (err instanceof NfceLookupError) throw err;
    throw new NfceLookupError('nfce_portal_error', uf);
  }
}
