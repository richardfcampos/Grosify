import { api } from './api.js';

/**
 * Serviço client de geração de lista por linguagem natural: chama
 * POST /ai/generate-list e traduz erros tipados do servidor em `Error(code)` —
 * o caller usa `error.message` como chave de `t('errors.<code>')`.
 *
 * Matching é feito no servidor (nfce/match-for-household.ts, reuso do
 * pipeline do NFC-e); o client só recebe as `lines` já classificadas
 * (matcheado/novo) e renderiza a revisão. `pro_required` é tratado à parte
 * pelo caller (abre PaywallSheet em vez de mensagem de erro) — molde de
 * `lib/nfce-import.ts`.
 */

/**
 * Item gerado já adaptado pelo servidor (`generatedToNfceItem`) — espelha `NfceItem`:
 * preço sempre 0 (nl-list não registra `price_records`), unidade já normalizada pro
 * enum `Unit` do app. Mesmo shape do `NfceRawItem` de `lib/nfce-import.ts`, o que
 * permite reusar `NfceLineRow` na revisão sem adaptação extra.
 */
export interface NlGeneratedItem {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitCents: number;
  valorTotalCents: number;
  ean: string | null;
}

/** Linha gerada já casada contra o catálogo — espelha `MatchResult` da API. */
export interface NlLine {
  lineIndex: number;
  itemId: string | null;
  confidence: number;
  method: 'exact' | 'fuzzy' | 'embedding' | null;
  suggestedName: string;
}

/** Resultado da geração pronto pra tela de revisão. */
export interface NlGenerateResult {
  items: NlGeneratedItem[];
  lines: NlLine[];
}

/**
 * Códigos de erro tipados que a rota /ai/generate-list pode devolver — 1:1
 * com as chaves `errors.*` do i18n. `pro_required` é tratado à parte pelo
 * caller (abre PaywallSheet em vez de mensagem de erro).
 */
export type NlListErrorCode =
  | 'ai_unavailable'
  | 'ai_generation_failed'
  | 'prompt_too_short'
  | 'prompt_too_long'
  | 'pro_required'
  | 'rate_limited';

/** Erro tipado da geração — `code` é a chave traduzível (`errors.<code>`). */
export class NlListError extends Error {
  constructor(readonly code: NlListErrorCode) {
    super(code);
    this.name = 'NlListError';
  }
}

/**
 * Gera itens a partir de um prompt em texto livre. Lança `NlListError` com o
 * código tipado devolvido pelo servidor (o caller decide UI: paywall pra
 * `pro_required`, mensagem pros demais). `listId` é opcional — só ecoa pro
 * client saber o destino (lista existente); a rota é stateless.
 */
export async function generateNlList(prompt: string, listId?: string): Promise<NlGenerateResult> {
  const res = await api.ai['generate-list'].$post({
    json: listId ? { prompt, listId } : { prompt },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const code = (body?.error ?? 'ai_generation_failed') as NlListErrorCode;
    throw new NlListError(code);
  }

  const body = (await res.json()) as { items: NlGeneratedItem[]; lines: NlLine[] };
  return { items: body.items, lines: body.lines };
}
