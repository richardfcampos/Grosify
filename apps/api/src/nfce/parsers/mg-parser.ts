import { ufFromChave } from '@grosify/shared';
import { registerNfceProvider } from '../index.js';
import { NfceLookupError, type NfceLookup, type NfceResult } from '../types.js';
import { fetchPortalHtml } from './portal-fetch.js';
import { parseSvrsHtml } from './svrs-html.js';

/**
 * Parser de Minas Gerais — portal próprio (portalsped.fazenda.mg.gov.br/portalnfce),
 * confirmado HTTP 200 sem captcha ao deep-link do QR (pesquisa). O HTML do DANFE de
 * MG replica a estrutura do portal SVRS (id="tabResult" + spans .txtTit/.Rqtd/…),
 * então o parse reusa `parseSvrsHtml`. Se MG divergir no futuro, este é o ponto de
 * especialização (só trocar a função de parse aqui, sem tocar no roteador).
 *
 * CPF do consumidor nunca é extraído.
 */
export class MgParser implements NfceLookup {
  readonly family = 'mg' as const;

  async fetchItems(chave: string, qrUrl: string): Promise<NfceResult> {
    const uf = ufFromChave(chave);
    if (!uf) throw new NfceLookupError('nfce_parse_failed');
    const html = await fetchPortalHtml(qrUrl, uf);
    return parseSvrsHtml(html, uf);
  }
}

// Auto-registro na factory do roteador — importar este módulo pluga a família mg.
registerNfceProvider('mg', () => new MgParser());
