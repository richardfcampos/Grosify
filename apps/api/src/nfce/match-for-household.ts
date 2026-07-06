import type { Unit } from '@grosify/shared';
import { embedAndCacheCatalog, loadCatalog } from './embed-cache.js';
import { matchItems, type MatchResult } from './matching.js';
import type { GeneratedLine } from './gemini-generate.js';
import type { NfceItem } from './types.js';

/**
 * Pipeline de matching por casa, reusado entre a rota de NFC-e e a de geração por
 * texto (nl-list). Extraído do helper privado de `routes/nfce.ts` (move-refactor puro:
 * mesma lógica `loadCatalog` → `embedAndCacheCatalog` → `matchItems`) pra reusar sem
 * duplicar. A linha gerada pelo LLM vira input do MESMO `matchItems` via adaptador —
 * sem tocar a assinatura do matching (que só lê `item.descricao`).
 *
 * NB: este módulo toca a camada de banco (via embed-cache) — por isso NÃO é
 * re-exportado no barrel `nfce/index.ts` (ver nota em index.ts): quem precisa importa
 * direto daqui, como a rota já fazia com embed-cache.
 */

/**
 * Casa os itens contra o catálogo da casa: garante o cache de embedding do catálogo
 * antes (quando `GEMINI_API_KEY`; sem chave é no-op e o matching cai pra fuzzy), depois
 * roda matchItems. `lines[i]` casa 1:1 com `itens[i]` via `lineIndex` (ordem preservada).
 */
export async function matchLinesForHousehold(
  householdId: string,
  itens: Parameters<typeof matchItems>[0],
): Promise<MatchResult[]> {
  const catalog = await loadCatalog(householdId);
  const withEmbeddings = await embedAndCacheCatalog(householdId, catalog);
  return matchItems(itens, withEmbeddings);
}

/**
 * Mapa das unidades cruas que o modelo costuma devolver (pt/en, sing./plural,
 * abreviações) pro enum `Unit` do app (`un|kg|g|l|ml`). Chaves normalizadas
 * (minúsculas, sem ponto). O que não bate cai no default 'un' — a qty é o que importa;
 * a unidade é secundária e editável na revisão.
 */
const UNIT_ALIASES: Record<string, Unit> = {
  // unidade avulsa
  un: 'un', und: 'un', unid: 'un', unidade: 'un', unidades: 'un', unit: 'un', units: 'un',
  pc: 'un', pct: 'un', pcte: 'un', pacote: 'un', pacotes: 'un', pack: 'un',
  cx: 'un', caixa: 'un', caixas: 'un', box: 'un',
  dz: 'un', duzia: 'un', duzias: 'un', dozen: 'un',
  garrafa: 'un', garrafas: 'un', bottle: 'un', lata: 'un', latas: 'un', can: 'un',
  // peso
  kg: 'kg', kgs: 'kg', quilo: 'kg', quilos: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg',
  g: 'g', gr: 'g', grama: 'g', gramas: 'g', gram: 'g', grams: 'g',
  // volume
  l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l', liter: 'l', liters: 'l', litre: 'l',
  ml: 'ml', mls: 'ml', mililitro: 'ml', mililitros: 'ml', milliliter: 'ml',
};

/**
 * Normaliza a string de unidade do modelo pro enum `Unit` do app. Default seguro 'un'
 * (edge case do spec: unidade não-canônica → 'un', qty preservada).
 */
export function normalizeUnit(unit: string): Unit {
  const key = unit.trim().toLowerCase().replace(/\./g, '');
  return UNIT_ALIASES[key] ?? 'un';
}

/**
 * Adaptador: linha gerada pelo LLM → `NfceItem` que o `matchItems` consome. O matching
 * só lê `descricao`; preço/EAN não são usados por ele, então vão zerados/null. A `unidade`
 * é normalizada pro enum do app (o client usa no `createItem`/`setListEntry`).
 */
export function generatedToNfceItem(line: GeneratedLine): NfceItem {
  return {
    descricao: line.name,
    quantidade: line.qty,
    unidade: normalizeUnit(line.unit),
    valorUnitCents: 0, // nl-list não registra preço (feature de NFC-e)
    valorTotalCents: 0,
    ean: null,
  };
}
