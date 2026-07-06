import type { NfceReviewLine } from '../features/nfce/nfce-line-row.js';
import type { NfceEmitente } from '../lib/nfce-import.js';

/** Resolução do passo de loja vinda da tela de revisão. */
export interface NfceStoreResolution {
  storeId: string | null;
  createName: string | null;
}

export interface ConfirmNfceReviewInput {
  chave: string;
  emitente: NfceEmitente;
  store: NfceStoreResolution;
  /** Só as linhas não-ignoradas (o caller já filtrou). */
  lines: NfceReviewLine[];
}

/**
 * Confirma a revisão do import de NFC-e: grava loja (se nova) + itens novos
 * (opt-in) + preços via repositórios Dexie/outbox (offline-first).
 *
 * Placeholder da T12 (UI/estado da revisão); a gravação real (createStore,
 * createItem+addBarcode antes do preço, recordPrice source='import') é da T13.
 */
export async function confirmNfceReview(_input: ConfirmNfceReviewInput): Promise<void> {
  throw new Error('nfce_confirm_not_implemented');
}
