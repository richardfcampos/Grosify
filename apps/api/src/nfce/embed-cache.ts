import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { items } from '../db/schema.js';
import { embed, embeddingEnabled, embeddingText } from './embedding.js';

/**
 * Cache de embedding do catálogo em `items.embedding` (jsonb, vetor 768d). O matching
 * de NFC-e reusa essa coluna e só embeda quem NÃO tem cache — evita re-chamar a API a
 * cada lookup. Sem `GEMINI_API_KEY`, tudo aqui vira no-op: a coluna fica null e o
 * matching cai pra fuzzy (embedding é sempre opcional, nunca bloqueia o fluxo).
 *
 * Invalidação no rename: quando o nome do item muda, o vetor cacheado fica obsoleto —
 * `invalidateEmbedding` zera a coluna (set null) e o próximo lookup re-embeda sob
 * demanda. Zerar (em vez de re-embedar no rename) mantém o schema como vetor puro
 * (`items.embedding: number[]`), sem wrapper de hash/versão, e adia o custo de rede
 * pro momento em que o item de fato participa de um matching.
 */

type Env = Record<string, string | undefined>;

/** Item do catálogo que participa do matching (só nome + vetor cacheado). */
export interface CatalogRow {
  id: string;
  name: string;
  embedding: number[] | null;
}

/**
 * Garante que os itens SEM cache tenham embedding, gerando em UMA chamada batch e
 * gravando na coluna. Retorna os itens com o vetor preenchido (os que já tinham cache
 * passam intactos). Sem chave ou sem pendências → devolve a lista como veio, sem I/O.
 *
 * `householdId` restringe a escrita à casa (defesa em profundidade — o caller já é
 * household-scoped). NUNCA lança por falha de embedding: se `embed` retorna null, os
 * itens ficam sem vetor e o matching usa fuzzy pra eles.
 */
export async function embedAndCacheCatalog(
  householdId: string,
  rows: CatalogRow[],
  env: Env = process.env,
): Promise<CatalogRow[]> {
  if (!embeddingEnabled(env)) return rows;

  const pending = rows.filter((r) => !r.embedding || r.embedding.length === 0);
  if (pending.length === 0) return rows; // cache hit total — sem chamada de rede

  const vecs = await embed(
    pending.map((r) => embeddingText(r.name)),
    env,
  );
  if (!vecs) return rows; // degrada silenciosamente pra fuzzy

  const byId = new Map(rows.map((r) => [r.id, { ...r }]));
  for (let i = 0; i < pending.length; i++) {
    const vec = vecs[i];
    if (!vec) continue;
    const row = byId.get(pending[i]!.id)!;
    row.embedding = vec;
    // Persiste o vetor na coluna — próximo lookup reusa sem re-embedar.
    await db
      .update(items)
      .set({ embedding: vec, updatedAt: new Date() })
      .where(and(eq(items.id, row.id), eq(items.householdId, householdId)));
  }
  return [...byId.values()];
}

/**
 * Invalida o embedding cacheado de um item (rename): zera a coluna pra forçar
 * re-embedding no próximo matching. No-op sem `GEMINI_API_KEY` (nunca houve cache).
 * Idempotente — chamar em item já sem vetor não faz mal.
 */
export async function invalidateEmbedding(
  householdId: string,
  itemId: string,
  env: Env = process.env,
): Promise<void> {
  if (!embeddingEnabled(env)) return;
  await db
    .update(items)
    .set({ embedding: null, updatedAt: new Date() })
    .where(and(eq(items.id, itemId), eq(items.householdId, householdId)));
}

/** Carrega o catálogo ativo da casa pro matching (id, nome, vetor cacheado). */
export async function loadCatalog(householdId: string): Promise<CatalogRow[]> {
  const rows = await db
    .select({ id: items.id, name: items.name, embedding: items.embedding })
    .from(items)
    .where(and(eq(items.householdId, householdId), isNull(items.deletedAt)));
  return rows.map((r) => ({ id: r.id, name: r.name, embedding: r.embedding ?? null }));
}
