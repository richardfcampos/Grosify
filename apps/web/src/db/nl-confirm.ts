import { UNITS, type Unit } from '@grosify/shared';
import type { NlReviewTarget } from '../features/nl-list/nl-review.js';
import { createItem, createList, setListEntry } from './repositories.js';

/** Linha revisada e não-ignorada, pronta pra materializar (o caller já filtrou). */
export interface NlConfirmLine {
  /** Item casado (matcheado ou escolhido manualmente); null = "criar novo". */
  itemId: string | null;
  /** Nome do item a criar quando `itemId` é null (pré-preenchido pelo texto gerado). */
  newItemName: string;
  /** Unidade já normalizada pelo servidor (`generatedToNfceItem`); defensivo aqui também. */
  unit: string;
  qty: number;
}

export interface ConfirmNlReviewInput {
  target: NlReviewTarget;
  lines: NlConfirmLine[];
}

/** `unit` cru vira `Unit` do enum — o servidor já normaliza, mas o tipo aqui é `string`. */
function toUnit(unit: string): Unit {
  return (UNITS as readonly string[]).includes(unit) ? (unit as Unit) : 'un';
}

/**
 * Confirma a revisão da lista gerada por texto: cria a lista (destino novo) ou
 * usa a existente, cria os itens "novo" (opt-in) ANTES da entrada — mesma ordem
 * de `confirmNfceReview` — e grava as entradas via repositórios Dexie/outbox
 * (offline-first). SEM preço, SEM loja (nl-list não registra `price_records`).
 */
export async function confirmNlReview(input: ConfirmNlReviewInput): Promise<void> {
  const listId =
    input.target.kind === 'new'
      ? await createList({ name: input.target.name, isRecurring: false })
      : input.target.listId;

  for (const line of input.lines) {
    const itemId = line.itemId ?? (await createItemFromLine(line));
    await setListEntry(listId, itemId, line.qty);
  }
}

/** Cria o item "novo" da linha (nome editado na revisão), sem código de barras. */
async function createItemFromLine(line: NlConfirmLine): Promise<string> {
  const name = line.newItemName.trim();
  return createItem({ name, unit: toUnit(line.unit), photoBlob: null, barcodes: [] });
}
