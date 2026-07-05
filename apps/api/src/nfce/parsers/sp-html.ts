import type { Uf } from '@grosify/shared';
import { NfceLookupError, type NfceItem, type NfceResult } from '../types.js';
import {
  afterColon,
  brMoneyToCents,
  brQuantity,
  buildResult,
  digitsOnly,
  extractEmitente,
  extractItemRows,
  extractNotaTotal,
  spanByClass,
} from './html-parse.js';

/**
 * Extração do HTML do portal SP (NFCeConsultaPublica, ASP.NET). O layout usa classes
 * próprias `fixo-prod-serv-*` por item (diferente do SVRS), então SP tem seu parseRow;
 * o resto (tabela, emitente, total) é compartilhado em html-parse.ts.
 *
 * Estrutura (id="tabResult"): cada item é um <tr> com spans:
 *   .fixo-prod-serv-descricao → descrição   .fixo-prod-serv-qtd  → quantidade
 *   .fixo-prod-serv-uc        → unidade      .fixo-prod-serv-vb   → valor unitário
 *   .fixo-prod-serv-vlr       → total linha  .fixo-prod-serv-cod-barras → código/EAN
 *
 * IMPORTANTE (escopo): SP aqui = NFC-e modelo 65. Cupom CF-e SAT (modelo 59) é outro
 * documento (satsp) e não passa por aqui. CPF do consumidor nunca é extraído.
 */

function parseRow(row: string): NfceItem | null {
  const descricao = spanByClass(row, 'fixo-prod-serv-descricao');
  if (!descricao) return null;

  const qtdRaw = afterColon(spanByClass(row, 'fixo-prod-serv-qtd'));
  const unidade = afterColon(spanByClass(row, 'fixo-prod-serv-uc')) || 'UN';
  const vlUnitRaw = afterColon(spanByClass(row, 'fixo-prod-serv-vb'));
  const vlTotalRaw = afterColon(spanByClass(row, 'fixo-prod-serv-vlr'));
  const codRaw = spanByClass(row, 'fixo-prod-serv-cod-barras');

  const codDigits = codRaw ? digitsOnly(codRaw) : '';
  const ean = /^\d{8,14}$/.test(codDigits) ? codDigits : null;

  return {
    descricao,
    quantidade: brQuantity(qtdRaw),
    unidade,
    valorUnitCents: vlUnitRaw ? brMoneyToCents(vlUnitRaw) : 0,
    valorTotalCents: vlTotalRaw ? brMoneyToCents(vlTotalRaw) : 0,
    ean,
  };
}

/** Parseia o HTML SP num NfceResult; lança `nfce_parse_failed` se 0 itens/soma divergente. */
export function parseSpHtml(html: string, uf: Uf): NfceResult {
  if (!html || html.length < 100) {
    throw new NfceLookupError('nfce_parse_failed', uf);
  }
  const itens: NfceItem[] = [];
  for (const row of extractItemRows(html)) {
    const item = parseRow(row);
    if (item) itens.push(item);
  }
  const { cnpj, nome } = extractEmitente(html);
  return buildResult({
    emitenteCnpj: cnpj,
    emitenteNome: nome,
    itens,
    notaTotalCents: extractNotaTotal(html),
    uf,
  });
}
