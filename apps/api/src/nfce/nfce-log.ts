import type { NfceRouteFamily, Uf } from '@grosify/shared';
import type { NfceErrorCode } from './types.js';

/**
 * Log estruturado e SEGURO de um lookup de NFC-e (LGPD/observabilidade).
 *
 * Só campos não-identificáveis entram no log: UF, família do portal, status/erro,
 * nº de itens, e a chave PARCIAL (apenas os 8 últimos dígitos — o suficiente pra
 * correlacionar/depurar sem expor a chave inteira). NUNCA loga o HTML cru do portal
 * nem o CPF do consumidor — esses nem chegam aqui (o parser/adapter os descarta na
 * origem, e este helper aceita só os campos abaixo).
 */

export interface NfceLogFields {
  uf: Uf | null;
  family?: NfceRouteFamily;
  /** 'parsed' no sucesso, ou o código de erro tipado na falha. */
  status: 'parsed' | NfceErrorCode;
  itemCount?: number;
  /** Chave de acesso completa — só os 8 últimos dígitos são logados. */
  chave?: string;
}

/** Mascara a chave pra log: mantém só os 8 últimos dígitos (o resto vira '*'). */
export function maskChave(chave: string | undefined): string {
  if (!chave) return '';
  const digits = chave.replace(/\D/g, '');
  if (digits.length <= 8) return digits;
  return `…${digits.slice(-8)}`;
}

/**
 * Emite o log de um lookup. Retorna também o objeto logado — facilita teste (o teste
 * inspeciona o que seria escrito, garantindo ausência de CPF/HTML).
 */
export function logNfceLookup(fields: NfceLogFields): Record<string, unknown> {
  const safe: Record<string, unknown> = {
    uf: fields.uf,
    status: fields.status,
    chave: maskChave(fields.chave),
  };
  if (fields.family) safe.family = fields.family;
  if (fields.itemCount !== undefined) safe.itemCount = fields.itemCount;
  console.info('[nfce:lookup]', JSON.stringify(safe));
  return safe;
}
