import type { Uf } from '@grosify/shared';
import { NfceLookupError, type NfceItem, type NfceResult } from '../types.js';

/**
 * Helpers de parse de HTML de portal SEFAZ compartilhados pelos parsers de família
 * (SVRS/SP/MG). Sem dependência de DOM/parser HTML (nenhum no runtime da API) —
 * extração por regex com âncoras estáveis + conversão reais→centavos pt-BR.
 *
 * REGRA LGPD: nenhum helper aqui extrai CPF; o parser lê SÓ itens + emitente (CNPJ).
 */

/**
 * Converte valor monetário BR ("12,90", "1.234,56", "12.90") pra centavos inteiros.
 * O risco é 100x (billing tem o mesmo cuidado): a vírgula é o separador decimal e o
 * ponto é milhar no formato pt-BR; um "12.90" (ponto decimal, formato en) também é
 * aceito pra robustez. round evita erro de float ("0,1+0,2").
 *
 * Lança se o texto não tem dígito nenhum — o caller trata como parse falho.
 */
export function brMoneyToCents(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '').trim();
  if (!/\d/.test(cleaned)) {
    throw new Error('valor monetário sem dígitos');
  }
  let normalized: string;
  if (cleaned.includes(',')) {
    // Formato pt-BR: ponto é milhar, vírgula é decimal → remove pontos, vírgula vira ponto.
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Sem vírgula: ponto (se houver) é decimal (formato en) — mantém.
    normalized = cleaned;
  }
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) {
    throw new Error('valor monetário inválido');
  }
  return Math.round(value * 100);
}

/**
 * Converte quantidade BR ("1", "2,5", "0,750") pra número. Mesma lógica de separador
 * do dinheiro, mas retorna float (a NFC-e fraciona por KG/L).
 */
export function brQuantity(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '').trim();
  if (!/\d/.test(cleaned)) return 0;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const value = Number.parseFloat(normalized);
  return Number.isNaN(value) ? 0 : value;
}

/** Colapsa entidades HTML comuns e espaços — deixa o texto do cupom legível. */
export function decodeHtmlText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai só os dígitos (CNPJ, EAN, NCM vêm formatados com pontos/barras no HTML). */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Recorta os <tr>...</tr> internos da tabela de itens (id="tabResult"). Os portais
 * SVRS, MG e SP renderizam os itens nessa mesma tabela — só as classes internas dos
 * spans mudam por família, então a extração de linhas é compartilhada.
 */
export function extractItemRows(html: string): string[] {
  const table = /<table[^>]*id=["']tabResult["'][^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!table?.[1]) return [];
  const rows: string[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(table[1])) !== null) {
    rows.push(m[1] ?? '');
  }
  return rows;
}

/** Texto de um <span> por classe dentro de um trecho de HTML (null se ausente). */
export function spanByClass(fragment: string, cls: string): string | null {
  const re = new RegExp(
    `<span[^>]*class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)</span>`,
    'i',
  );
  const m = re.exec(fragment);
  return m ? decodeHtmlText(m[1] ?? '') : null;
}

/** "Qtde.: 2" / "Vl. Unit.: 12,90" → só o valor após o ":" (texto inteiro se não houver). */
export function afterColon(text: string | null): string {
  if (!text) return '';
  const idx = text.indexOf(':');
  return idx >= 0 ? text.slice(idx + 1).trim() : text.trim();
}

/** Emitente: nome em <div id="u20"> + CNPJ do bloco "CNPJ:" (só dígitos). Comum às UFs. */
export function extractEmitente(html: string): { cnpj: string; nome: string } {
  const nomeM = /<div[^>]*id=["']u20["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);
  const nome = nomeM ? decodeHtmlText(nomeM[1] ?? '') : '';
  const cnpjM = /CNPJ:\s*([\d./-]{14,20})/i.exec(html);
  const cnpj = cnpjM ? digitsOnly(cnpjM[1] ?? '') : '';
  return { cnpj, nome };
}

/** Total da nota do rodapé ("Valor total R$ 41,70") em centavos — null se ausente/ilegível. */
export function extractNotaTotal(html: string): number | null {
  const m = /Valor\s+total[^R]*R\$?\s*([\d.,]+)/i.exec(html);
  if (!m?.[1]) return null;
  try {
    return brMoneyToCents(m[1]);
  } catch {
    return null;
  }
}

/**
 * Valida o resultado montado por um parser antes de devolver:
 *  - 0 itens → `nfce_parse_failed` (HTML mudou / seletor errado — NUNCA itens vazios
 *    silenciosos)
 *  - soma das linhas divergindo do total da nota em >1% → `nfce_parse_failed`
 *    (proteção contra parse parcial silenciosamente errado, ex.: perder linhas)
 *
 * O total da nota (`notaTotalCents`) é o valor lido do rodapé do cupom; quando o
 * portal não expõe um total confiável, passe null pra pular só a checagem de soma
 * (a checagem de "0 itens" continua valendo).
 */
export function assertParsed(
  itens: NfceItem[],
  notaTotalCents: number | null,
  uf: Uf,
): number {
  if (itens.length === 0) {
    throw new NfceLookupError('nfce_parse_failed', uf);
  }
  const somaCents = itens.reduce((acc, item) => acc + item.valorTotalCents, 0);
  if (notaTotalCents !== null && notaTotalCents > 0) {
    const diff = Math.abs(somaCents - notaTotalCents);
    // Tolerância de 1% absorve arredondamento/acréscimos-descontos de rodapé; acima
    // disso o parse provavelmente perdeu/duplicou linhas → falha em vez de gravar errado.
    if (diff > notaTotalCents * 0.01) {
      throw new NfceLookupError('nfce_parse_failed', uf);
    }
  }
  return somaCents;
}

/**
 * Monta o `NfceResult` final a partir das partes já extraídas pelo parser de família.
 * Centraliza a validação (assertParsed) e o cálculo do total. O total devolvido é o
 * da nota quando disponível e coerente; senão a soma das linhas.
 */
export function buildResult(params: {
  emitenteCnpj: string;
  emitenteNome: string;
  itens: NfceItem[];
  notaTotalCents: number | null;
  uf: Uf;
}): NfceResult {
  const somaCents = assertParsed(params.itens, params.notaTotalCents, params.uf);
  return {
    emitente: { cnpj: params.emitenteCnpj, nome: params.emitenteNome },
    itens: params.itens,
    totalCents: params.notaTotalCents ?? somaCents,
    uf: params.uf,
  };
}
