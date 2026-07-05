import { normalizeDescription } from '@grosify/shared';
import type { NfceItem } from './types.js';
import { cosine, embed, embeddingEnabled } from './embedding.js';

/**
 * Matching híbrido de descrição de cupom → catálogo da casa. Determinístico e 100%
 * testável sem rede: normaliza (shared) os dois lados, tenta exato, depois fuzzy por
 * token-set (similaridade própria — sem dep pesada); a faixa ambígua vira candidata
 * a desempate por embedding (só quando `GEMINI_API_KEY`; senão fica no fuzzy).
 *
 * Fuzzy próprio (não `fuzzball`): score = token-set overlap ponderado por unicidade
 * do maior token compartilhado. `normalizeDescription` já tira marca/unidade/abreviação,
 * então sobra o "nome" do produto — o token da categoria costuma bater literal.
 *
 * Thresholds (conservadores — na dúvida, "novo"; nunca casa errado silenciosamente):
 *   score ≥ MATCH        → matcheado (fuzzy)
 *   AMBIGUOUS ≤ score    → candidato (desempata por embedding se houver chave)
 *   score < AMBIGUOUS    → "novo" (nome pré-preenchido pela descrição da nota)
 */

/** Item do catálogo relevante pro matching (vetor cacheado opcional). */
export interface CatalogItem {
  id: string;
  name: string;
  /** Embedding cacheado (items.embedding) — usado no desempate; ausente = fuzzy só. */
  embedding?: number[] | null;
}

/** Como uma linha foi resolvida. */
export type MatchMethod = 'exact' | 'fuzzy' | 'embedding';

/** Resultado por linha da nota. `itemId` null = "novo" (sugerir criar item). */
export interface MatchResult {
  /** Índice da linha em `itens` (preserva ordem/qualquer edição no client). */
  lineIndex: number;
  itemId: string | null;
  /** 0..1 — confiança do match; 0 quando "novo". */
  confidence: number;
  method: MatchMethod | null;
  /** Nome sugerido pra criar item quando "novo" (descrição literal do cupom). */
  suggestedName: string;
}

/** Score fuzzy alto: aceita como match direto. */
const MATCH_THRESHOLD = 0.72;
/** Piso da faixa ambígua: entre AMBIGUOUS e MATCH tenta embedding pra desempatar. */
const AMBIGUOUS_THRESHOLD = 0.4;
/** Cosine mínimo pro embedding confirmar um candidato ambíguo. */
const EMBEDDING_THRESHOLD = 0.6;

/** Quebra em tokens únicos, descartando vazios. */
function tokenSet(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter(Boolean));
}

/**
 * Similaridade token-set entre a descrição da nota e o nome do catálogo (ambos já
 * normalizados). Combina cobertura (quantos tokens do catálogo aparecem na nota) com
 * Jaccard (penaliza ruído), dando peso à cobertura — a descrição do cupom é mais
 * longa/ruidosa que o nome do item, então "conter o nome" vale mais que igualdade.
 */
export function tokenSetScore(noteNorm: string, catalogNorm: string): number {
  const a = tokenSet(noteNorm);
  const b = tokenSet(catalogNorm);
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const tok of b) if (a.has(tok)) shared++;
  if (shared === 0) return 0;

  const coverage = shared / b.size; // fração do nome do item presente na nota
  const union = a.size + b.size - shared;
  const jaccard = shared / union;
  // Peso 70/30: cobertura do nome do item domina; Jaccard corta ruído grande.
  return coverage * 0.7 + jaccard * 0.3;
}

interface ScoredCandidate {
  item: CatalogItem;
  score: number;
}

/** Melhor e 2º melhor candidato por score fuzzy (pra detectar empate/ambiguidade). */
function rankCandidates(noteNorm: string, catalog: CatalogItem[]): ScoredCandidate[] {
  return catalog
    .map((item) => ({ item, score: tokenSetScore(noteNorm, normalizeDescription(item.name)) }))
    .sort((x, y) => y.score - x.score);
}

/**
 * Casa UMA descrição contra o catálogo, SEM embedding (parte determinística).
 * Retorna o item + confiança + método quando o fuzzy resolve com folga; null quando
 * fica abaixo do mínimo OU ambíguo (2 candidatos empatados na faixa alta) — o caller
 * decide se tenta desempatar por embedding.
 */
export function matchLine(
  descricao: string,
  catalog: CatalogItem[],
): { itemId: string; confidence: number; method: 'exact' | 'fuzzy' } | null {
  if (catalog.length === 0) return null; // casa sem catálogo → tudo "novo"
  const noteNorm = normalizeDescription(descricao);
  if (noteNorm === '') return null;

  // 1) Exato: nome do item normalizado idêntico à descrição normalizada.
  for (const item of catalog) {
    if (normalizeDescription(item.name) === noteNorm) {
      return { itemId: item.id, confidence: 1, method: 'exact' };
    }
  }

  // 2) Fuzzy token-set: melhor candidato acima do limiar, sem empate na faixa alta.
  const ranked = rankCandidates(noteNorm, catalog);
  const best = ranked[0];
  if (!best || best.score < MATCH_THRESHOLD) return null;

  const runnerUp = ranked[1];
  // Empate na faixa alta (2 itens quase iguais) → ambíguo: nunca auto-casa; deixa o
  // desempate por embedding (ou vira "novo"/escolher). Diferença <0.05 = empate.
  if (runnerUp && best.score - runnerUp.score < 0.05) return null;

  return { itemId: best.item.id, confidence: best.score, method: 'fuzzy' };
}

/** Candidatos na faixa ambígua (entre AMBIGUOUS e MATCH, ou empatados no topo). */
function ambiguousCandidates(noteNorm: string, catalog: CatalogItem[]): CatalogItem[] {
  return rankCandidates(noteNorm, catalog)
    .filter((c) => c.score >= AMBIGUOUS_THRESHOLD)
    .slice(0, 5)
    .map((c) => c.item);
}

/**
 * Casa todas as linhas da nota contra o catálogo. Pipeline por linha:
 *   1. fuzzy determinístico (matchLine) — se resolve, pronto;
 *   2. senão, se `GEMINI_API_KEY` e há candidatos na faixa ambígua, embeda a
 *      descrição e desempata por cosine vs. o vetor cacheado de cada candidato;
 *   3. senão → "novo" (itemId null, nome sugerido).
 *
 * NUNCA lança por falta de chave: sem embedding, para no passo 1/3. Catálogo vazio →
 * tudo "novo". O embedding roda em UMA chamada batch só pras linhas ainda ambíguas.
 */
export async function matchItems(
  itens: NfceItem[],
  catalog: CatalogItem[],
  env: Record<string, string | undefined> = process.env,
): Promise<MatchResult[]> {
  const results: MatchResult[] = itens.map((item, lineIndex) => {
    const hit = matchLine(item.descricao, catalog);
    return hit
      ? { lineIndex, itemId: hit.itemId, confidence: hit.confidence, method: hit.method, suggestedName: item.descricao }
      : { lineIndex, itemId: null, confidence: 0, method: null, suggestedName: item.descricao };
  });

  // Desempate por embedding só pras linhas ainda "novo" E só se a chave existe.
  if (!embeddingEnabled(env)) return results;

  const pending = results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.itemId === null)
    .map(({ r, i }) => ({
      r,
      i,
      candidates: ambiguousCandidates(normalizeDescription(itens[i]!.descricao), catalog),
    }))
    .filter(({ candidates }) => candidates.length > 0);

  if (pending.length === 0) return results;

  // Embeda todas as descrições ambíguas numa chamada; null = degrada silenciosamente.
  const queryVecs = await embed(
    pending.map(({ i }) => normalizeDescription(itens[i]!.descricao)),
    env,
  );
  if (!queryVecs) return results; // sem sinal de embedding → fica no fuzzy

  pending.forEach(({ r, candidates }, k) => {
    const query = queryVecs[k];
    if (!query) return;
    let bestId: string | null = null;
    let bestCos = EMBEDDING_THRESHOLD;
    for (const cand of candidates) {
      if (!cand.embedding || cand.embedding.length === 0) continue; // sem cache, pula
      const sim = cosine(query, cand.embedding);
      if (sim > bestCos) {
        bestCos = sim;
        bestId = cand.id;
      }
    }
    if (bestId) {
      r.itemId = bestId;
      r.confidence = bestCos;
      r.method = 'embedding';
    }
  });

  return results;
}
