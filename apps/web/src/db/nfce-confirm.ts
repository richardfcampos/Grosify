import type { NfceReviewLine } from '../features/nfce/nfce-line-row.js';
import type { NfceEmitente } from '../lib/nfce-import.js';
import { addBarcode, createItem, createStore, recordPrice } from './repositories.js';

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
 * (opt-in) + preços via repositórios Dexie/outbox (offline-first) — sempre
 * nessa ordem por linha: item novo primeiro (senão o preço referencia um
 * itemId que não existe), depois o preço com `source:'import'`.
 *
 * O POST /nfce/confirm (status server-side) é chamado pelo caller à parte
 * (best-effort) — os dados locais já são a fonte da verdade nesta função.
 */
export async function confirmNfceReview(input: ConfirmNfceReviewInput): Promise<void> {
  const storeId = await resolveStoreId(input.store, input.emitente);

  for (const line of input.lines) {
    const itemId = line.itemId ?? (await createItemFromLine(line));
    await recordPrice(itemId, storeId, line.priceCents, null, null, 'import');
  }
}

/** Loja existente (CNPJ já casado na revisão) ou nova, criada agora com o CNPJ do emitente. */
async function resolveStoreId(store: NfceStoreResolution, emitente: NfceEmitente): Promise<string> {
  if (store.storeId) return store.storeId;
  const name = store.createName?.trim() || emitente.nome;
  return createStore({ name, cnpj: emitente.cnpj || null });
}

/** Cria o item "novo" da linha (nome editado na revisão) + vincula o EAN da nota, se houver. */
async function createItemFromLine(line: NfceReviewLine): Promise<string> {
  const name = line.newItemName.trim() || line.raw.descricao;
  const itemId = await createItem({ name, unit: 'un', photoBlob: null, barcodes: [] });
  if (line.raw.ean) await addBarcode(itemId, line.raw.ean);
  return itemId;
}
