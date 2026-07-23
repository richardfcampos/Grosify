import { parseNfceQr } from '@grosify/shared';
import { api } from './api.js';

/**
 * Serviço client de import de NFC-e: detecta QR de nota (vs. produto), chama
 * POST /nfce/lookup e traduz erros tipados do servidor em `Error(code)` — o
 * caller usa `error.message` como chave de `t('errors.<code>')`.
 *
 * Matching é feito no servidor (nfce/matching.ts); o client só recebe as
 * `lines` já classificadas (matcheado/novo) e renderiza a revisão.
 */

/** Linha da nota já casada contra o catálogo — espelha `MatchResult` da API. */
export interface NfceLine {
  lineIndex: number;
  itemId: string | null;
  confidence: number;
  method: 'exact' | 'fuzzy' | 'embedding' | null;
  suggestedName: string;
}

/** Item bruto da nota (antes do matching) — usado pra editar preço/qty na revisão. */
export interface NfceRawItem {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitCents: number;
  valorTotalCents: number;
  ean: string | null;
  ncm?: string | null;
}

export interface NfceEmitente {
  cnpj: string;
  nome: string;
}

/** Resultado do lookup pronto pra tela de revisão. */
export interface NfceLookupResult {
  chave: string;
  cached: boolean;
  alreadyImported: boolean;
  emitente: NfceEmitente;
  totalCents: number;
  itens: NfceRawItem[];
  lines: NfceLine[];
}

/**
 * Códigos de erro tipados que a rota /nfce/lookup pode devolver — 1:1 com as
 * chaves `errors.*` do i18n. `nfce_quota_free` é tratado à parte pelo caller
 * (abre PaywallSheet em vez de mensagem de erro).
 */
export type NfceErrorCode =
  | 'nfce_invalid_qr'
  | 'nfce_invalid_key'
  | 'uf_unsupported'
  | 'state_unsupported'
  | 'nfce_parse_failed'
  | 'nfce_portal_error'
  | 'nfce_provider_error'
  | 'nfce_quota_free'
  | 'nfce_quota_pro';

/** Erro tipado do import — `code` é a chave traduzível (`errors.<code>`). */
export class NfceImportError extends Error {
  constructor(readonly code: NfceErrorCode) {
    super(code);
    this.name = 'NfceImportError';
  }
}

/** true quando `rawValue` do scanner é um QR de NFC-e (chave+UF válidos). */
export function isNfceQr(rawValue: string): boolean {
  return parseNfceQr(rawValue) !== null;
}

/**
 * Resultado do lookup: a nota já está pronta (`ready`) ou ainda está sendo consultada
 * no portal (`processing`) — o lookup é assíncrono porque o provider pago faz cold
 * scraping >70s. Em `processing` o caller faz polling até virar `ready` (ou erro).
 */
export type LookupOutcome =
  | { status: 'ready'; result: NfceLookupResult }
  | { status: 'processing' };

/**
 * Consulta o lookup de uma NFC-e a partir do rawValue do QR. Retorna `processing` (HTTP
 * 202) enquanto o portal é consultado em background, ou `ready` com a nota. Lança
 * `NfceImportError` com o código tipado em erro (o caller decide UI: paywall pra
 * quota_free, mensagem pros demais). `retry` só no scan inicial do usuário — re-dispara
 * uma nota que falhou antes; os polls omitem (não re-raspam falha em loop).
 */
export async function lookupNfce(
  qrUrl: string,
  opts?: { retry?: boolean },
): Promise<LookupOutcome> {
  const parsed = parseNfceQr(qrUrl);
  if (!parsed) throw new NfceImportError('nfce_invalid_qr');

  const res = await api.nfce.lookup.$post({ json: { qrUrl, retry: opts?.retry ?? false } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const code = (body?.error ?? 'nfce_portal_error') as NfceErrorCode;
    throw new NfceImportError(code);
  }
  // 202 = nota ainda em consulta no portal (background). O caller faz polling.
  if (res.status === 202) return { status: 'processing' };

  const body = (await res.json()) as {
    cached: boolean;
    alreadyImported: boolean;
    emitente: NfceEmitente;
    totalCents: number;
    itens: NfceRawItem[];
    lines: NfceLine[];
  };

  return {
    status: 'ready',
    result: {
      chave: parsed.chave,
      cached: body.cached,
      alreadyImported: body.alreadyImported,
      emitente: body.emitente,
      totalCents: body.totalCents,
      itens: body.itens,
      lines: body.lines,
    },
  };
}

/** Confirma a nota no servidor (best-effort — status server-side, não bloqueia a gravação local). */
export async function confirmNfce(chave: string): Promise<void> {
  try {
    await api.nfce.confirm.$post({ json: { chave } });
  } catch {
    // Best-effort: os dados locais (price_records/itens) já foram gravados via
    // outbox — são a fonte da verdade. Se o confirm falhar (rede), o status
    // server-side fica "parsed" em vez de "confirmed"; não afeta o usuário
    // (não há re-lookup automático da mesma chave) e não vale reter/retry aqui.
  }
}
