import { ufFromChave } from '@grosify/shared';
import { registerNfceProvider } from '../index.js';
import { NfceLookupError, type NfceLookup, type NfceResult } from '../types.js';
import { fetchPortalHtml } from './portal-fetch.js';
import { parseSvrsHtml } from './svrs-html.js';

/**
 * Parser da família SVRS (Sefaz Virtual RS) — atende RS + UFs conveniadas que
 * consultam nesse portal compartilhado (AC, AP, PB, RR, RO, SC, ES, PI, MA, PA, AL,
 * DF na tabela `NFCE_UF_ROUTES`). Faz fetch do deep-link do QR e parseia o HTML.
 *
 * Testado empiricamente (pesquisa): SVRS/RS responde HTTP 200 ao deep-link sem
 * captcha/WAF. CPF do consumidor nunca é extraído (parseSvrsHtml ignora o rodapé).
 */
export class SvrsParser implements NfceLookup {
  readonly family = 'svrs' as const;

  async fetchItems(chave: string, qrUrl: string): Promise<NfceResult> {
    // A UF real vem da própria chave (2 díg. IBGE) — o portal SVRS é compartilhado
    // por várias UFs, então derivar da chave dá a sigla correta no resultado/erro.
    const uf = ufFromChave(chave);
    if (!uf) throw new NfceLookupError('nfce_parse_failed');
    const html = await fetchPortalHtml(qrUrl, uf);
    return parseSvrsHtml(html, uf);
  }
}

// Auto-registro na factory do roteador — importar este módulo pluga a família svrs.
registerNfceProvider('svrs', () => new SvrsParser());
