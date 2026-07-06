import type { Uf } from '@grosify/shared';
import { NfceLookupError, type NfceItem, type NfceResult } from '../types.js';
import {
  afterColon,
  brMoneyToCents,
  brQuantity,
  buildResult,
  decodeHtmlText,
  digitsOnly,
  extractEmitente,
  extractItemRows,
  extractNotaTotal,
  spanByClass,
} from './html-parse.js';

/**
 * Extração do HTML do portal SVRS (Sefaz Virtual RS). O portal SVRS é infra
 * compartilhada — RS usa direto, e MG replica a mesma estrutura de DANFE. Por isso
 * svrs-parser e mg-parser reusam este extrator (só o fetch/URL difere por família).
 *
 * Estrutura do HTML (id="tabResult"): cada item é um <tr>, com spans de classe:
 *   .txtTit  → descrição       .Rqtd → "Qtde.:N"      .RvlUnit → "Vl. Unit.:R$N"
 *   .RCod    → "(Código: N)"   .RUN  → "UN: X"         td.valor → total da linha
 *
 * CPF do consumidor (quando aparece no rodapé) é IGNORADO — nunca lido (LGPD).
 */

function parseRow(row: string): NfceItem | null {
  const descricao = spanByClass(row, 'txtTit');
  if (!descricao) return null; // linha sem descrição não é item (cabeçalho/rodapé)

  const qtdRaw = afterColon(spanByClass(row, 'Rqtd'));
  const unidade = afterColon(spanByClass(row, 'RUN')) || 'UN';
  const vlUnitRaw = afterColon(spanByClass(row, 'RvlUnit'));
  const codRaw = spanByClass(row, 'RCod');

  // Total da linha: td.valor (fora dos spans), com fallback pra classe "valor".
  const totalTd = /<td[^>]*class=["'][^"']*\bvalor\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(row);
  const vlTotalRaw = totalTd ? decodeHtmlText(totalTd[1] ?? '') : (spanByClass(row, 'valor') ?? '');

  // EAN quando o código numérico tem 8-14 díg. (GTIN); senão null ("SEM GTIN").
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

/**
 * Parseia o HTML SVRS/MG num NfceResult. Lança `nfce_parse_failed` (via buildResult)
 * quando não há itens ou a soma diverge do total da nota em >1%.
 */
export function parseSvrsHtml(html: string, uf: Uf): NfceResult {
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
