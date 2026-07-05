import type { NfceRouteFamily, Uf } from '@grosify/shared';

/**
 * Porta de consulta de NFC-e (Dependency Inversion) — espelha billing/types.ts e
 * email/types.ts. O roteador (./index.ts) é o ÚNICO lugar que conhece as famílias
 * concretas (parsers próprios + adapter pago). Adicionar UF = implementar/plugar um
 * provider + registrar o roteamento na tabela compartilhada; callers não mudam.
 *
 *   ┌──────────────────┐   lookupFor(uf)   ┌──────────────┐
 *   │ rota /nfce/lookup │ ───────────────▶  │ NfceLookup   │  (porta)
 *   └──────────────────┘                   └──────┬───────┘
 *                          implementa │     ┌─────┴─────┬──────────┐
 *                                     ▼     ▼           ▼          ▼
 *                              SvrsParser  SpParser  MgParser  InfosimplesAdapter
 */

/**
 * Item já normalizado de uma NFC-e. Valores SEMPRE em centavos (minor units da
 * moeda) — a conversão de "12,90"/"12.90" reais acontece na origem (parser/adapter).
 *
 * NÃO há campo de CPF: o CPF do consumidor é descartado no parser/adapter antes de
 * qualquer retorno (LGPD — guardamos só itens + emitente PJ + chave).
 */
export interface NfceItem {
  /** Descrição literal do cupom (abreviada), ex.: "ARROZ TP1 5KG CAMIL". */
  descricao: string;
  /** Quantidade comprada (float — a NFC-e permite fracionar por KG/L). */
  quantidade: number;
  /** Unidade comercial do cupom (UN, KG, L…) — texto cru do portal. */
  unidade: string;
  /** Valor unitário em centavos (round(valor_reais * 100)). */
  valorUnitCents: number;
  /** Valor total da linha em centavos. */
  valorTotalCents: number;
  /** Código de barras (EAN/GTIN) quando presente na nota; null quando "SEM GTIN". */
  ean: string | null;
  /** NCM (8 díg.) quando presente — prior gratuito de categoria; opcional. */
  ncm?: string | null;
}

/** Emitente (loja) da nota — identificado por CNPJ (dado público de PJ). */
export interface NfceEmitente {
  cnpj: string;
  nome: string;
}

/** Resultado completo de um lookup de NFC-e. */
export interface NfceResult {
  emitente: NfceEmitente;
  itens: NfceItem[];
  /** Soma das linhas em centavos (usada pra validar o parse contra o total da nota). */
  totalCents: number;
  uf: Uf;
}

/**
 * Porta que uma família de portal implementa. `family` identifica a implementação
 * (svrs/sp/mg/infosimples) pra observabilidade; `fetchItems` faz o I/O (fetch +
 * parse do HTML, ou POST no adapter pago) e devolve o resultado normalizado.
 */
export interface NfceLookup {
  readonly family: NfceRouteFamily;
  fetchItems(chave: string, qrUrl: string): Promise<NfceResult>;
}

/**
 * Códigos de erro tipados do pipeline de lookup — 1:1 com os `errors.*` do client
 * e com os status HTTP da rota (mapeados em routes/nfce.ts):
 *   uf_unsupported     → 422  (UF sem parser nem adapter)
 *   state_unsupported  → 501  (SE sem INFOSIMPLES_TOKEN)
 *   nfce_parse_failed  → 422  (HTML mudou / 0 itens / total divergente)
 *   nfce_portal_error  → 504  (portal SEFAZ timeout/HTTP≠200)
 *   nfce_provider_error→ 502  (adapter pago fora / token inválido)
 */
export type NfceErrorCode =
  | 'uf_unsupported'
  | 'state_unsupported'
  | 'nfce_parse_failed'
  | 'nfce_portal_error'
  | 'nfce_provider_error';

/**
 * Erro tipado do lookup — carrega o código pra rota traduzir em status + `errors.*`,
 * e a UF pra UI explicar ("importação ainda não disponível em {UF}"). A mensagem é
 * segura pra log (nunca contém HTML cru nem CPF).
 */
export class NfceLookupError extends Error {
  constructor(
    readonly code: NfceErrorCode,
    readonly uf?: Uf,
  ) {
    super(code);
    this.name = 'NfceLookupError';
  }
}
