import { normalizeDescription } from '@grosify/shared';

/**
 * Embeddings de texto via Gemini REST puro (sem SDK) — desempate OPCIONAL do
 * matching de NFC-e. ENV-GATED por `GEMINI_API_KEY` (molde do email/index.ts):
 * sem a chave, `embed` retorna null e o matching cai pra fuzzy puro — NUNCA lança.
 *
 * Modelo: `gemini-embedding-001` (GA, #1 MTEB multilíngue/pt), truncado a 768d via
 * Matryoshka (`outputDimensionality`) — cabe no free tier e mantém o vetor pequeno
 * (200 itens × 768 float ≈ 0.6 MB, cosine em memória <1ms; pgvector é overkill aqui).
 *
 * Cache: os vetores do catálogo ficam em `items.embedding` (jsonb). Este módulo só
 * faz a chamada de rede e o cosine; a persistência/reuso vive no helper de cache
 * (`embed-cache.ts`), que só embeda item sem vetor válido.
 */

type Env = Record<string, string | undefined>;

const MODEL = 'gemini-embedding-001';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;
/** Dimensão truncada (MRL) — Google recomenda 768/1536 pra economizar storage. */
export const EMBEDDING_DIM = 768;
const TIMEOUT_MS = 15_000;

interface BatchEmbedResponse {
  embeddings?: Array<{ values?: number[] }>;
}

/**
 * Embeda uma lista de textos em UMA chamada (batchEmbedContents). Retorna:
 *   - `number[][]` alinhado 1:1 com `texts` no sucesso;
 *   - `null` quando não há `GEMINI_API_KEY` (feature desligada) OU a chamada falha
 *     (timeout/rede/HTTP≠200/JSON inválido) — degradação silenciosa, o caller fica
 *     com o resultado do fuzzy. Embedding é desempate, nunca caminho crítico.
 */
export async function embed(texts: string[], env: Env = process.env): Promise<number[][] | null> {
  const key = env.GEMINI_API_KEY;
  if (!key) return null; // env-gate: sem chave, matching usa só fuzzy
  if (texts.length === 0) return [];

  try {
    const res = await fetch(`${ENDPOINT}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIM,
        })),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as BatchEmbedResponse;
    const rows = body.embeddings;
    // Resposta malformada (tamanho divergente ou vetor ausente) → degrada pra fuzzy.
    if (!rows || rows.length !== texts.length) return null;
    const out: number[][] = [];
    for (const row of rows) {
      if (!row.values || row.values.length === 0) return null;
      out.push(row.values);
    }
    return out;
  } catch {
    // Timeout, rede, JSON inválido — silencioso: o matching não pode quebrar por isso.
    return null;
  }
}

/** Se o embedding está ligado (há chave) — usado pra pular chamadas quando desligado. */
export function embeddingEnabled(env: Env = process.env): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

/**
 * Similaridade de cosseno entre dois vetores de mesma dimensão. Retorna 0 quando as
 * dimensões divergem ou algum vetor é nulo (magnitude 0) — nunca lança (o matching
 * trata 0 como "sem sinal" e não casa por embedding).
 */
export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** Texto que representa um item do catálogo pro embedding (nome normalizado). */
export function embeddingText(name: string): string {
  return normalizeDescription(name);
}
