import { ufFromChave } from '@grosify/shared';
import { registerNfceProvider } from '../index.js';
import { NfceLookupError, type NfceLookup, type NfceResult } from '../types.js';
import { fetchPortalHtml } from './portal-fetch.js';
import { parseSpHtml } from './sp-html.js';

/**
 * Parser de São Paulo — portal próprio (nfce.fazenda.sp.gov.br/NFCeConsultaPublica),
 * confirmado HTTP 200 sem captcha ao deep-link do QR com UA de browser (pesquisa).
 *
 * Escopo: SÓ NFC-e modelo 65. No varejo paulista o CF-e SAT (modelo 59) é comum e é
 * OUTRO documento (satsp) — fora do MVP; um cupom SAT não gera esta URL de portal.
 * CPF do consumidor nunca é extraído.
 */
export class SpParser implements NfceLookup {
  readonly family = 'sp' as const;

  async fetchItems(chave: string, qrUrl: string): Promise<NfceResult> {
    const uf = ufFromChave(chave);
    if (!uf) throw new NfceLookupError('nfce_parse_failed');
    const html = await fetchPortalHtml(qrUrl, uf);
    return parseSpHtml(html, uf);
  }
}

// Auto-registro na factory do roteador — importar este módulo pluga a família sp.
registerNfceProvider('sp', () => new SpParser());
