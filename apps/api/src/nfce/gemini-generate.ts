import { z } from 'zod';

/**
 * Geração de lista de compras via Gemini REST puro (sem SDK) — molde EXATO do
 * `embedding.ts`: mesmo host da generativelanguage API, env-gate por `GEMINI_API_KEY`,
 * `AbortSignal.timeout`, e retorno **null** em QUALQUER falha (sem chave, timeout,
 * rede, HTTP≠200, JSON inválido). A rota (caller) decide o HTTP: sem chave → 501;
 * null por parse → 1 retry → 502. Aqui NUNCA lançamos.
 *
 * Diferente do embedding (que é desempate opcional e degrada pra fuzzy), aqui a
 * geração É a feature — não há fallback. `null` significa "não gerei"; o caller
 * distingue "sem chave" (feature desligada) de "falhou" pelo env-gate que já roda
 * antes de chamar esta função na rota.
 *
 * Structured output: `generationConfig.responseMimeType='application/json'` +
 * `responseSchema` (array de {name,qty,unit}) faz o modelo devolver JSON garantido
 * pelo schema, sem embrulho em markdown/prosa. O zod é a rede de segurança: valida
 * a saída e descarta linha sem `name` (o campo que o matching usa como descrição).
 */

type Env = Record<string, string | undefined>;

/**
 * Modelo de geração. Default `gemini-2.0-flash` (rápido/barato, structured output,
 * free tier cobre). Override por env pra ajustar sem redeploy de código (ex.: subir
 * pra flash GA vigente). Mesma família/host do `embedding.ts` (gemini-embedding-001).
 */
const DEFAULT_MODEL = 'gemini-2.0-flash';
const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 15_000;

/** Limite superior de quantidade — qty absurda do modelo vira 1 (default seguro). */
const MAX_QTY = 999;

/**
 * System instruction curta (inglês): comportamento da geração. Itens genéricos de
 * supermercado (sem marca), qty+unidade sensatos pro contexto, e — crucial — resposta
 * no idioma do prompt do usuário (o matching normaliza acento/caixa dos dois lados).
 */
const SYSTEM_INSTRUCTION =
  'You build supermarket shopping lists. Given a description of an occasion or need, ' +
  'return a list of generic grocery items (no brands) with a sensible quantity and unit ' +
  'for that context. Always answer in the same language as the user prompt.';

/** Uma linha gerada pelo modelo: nome + quantidade + unidade (crua, normalizada depois). */
export interface GeneratedLine {
  name: string;
  qty: number;
  unit: string;
}

/** Schema JSON que o Gemini deve devolver — array de objetos {name, qty, unit}. */
const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING' },
      qty: { type: 'NUMBER' },
      unit: { type: 'STRING' },
    },
    required: ['name', 'qty', 'unit'],
  },
} as const;

/**
 * Valida UMA linha da resposta. `name` obrigatório e não-vazio (é a descrição que o
 * matching usa); linha sem name é descartada. `qty` fora de (0, 999] vira 1 — clamp
 * seguro contra qty absurda do modelo (a qty é editável na revisão de qualquer jeito).
 * `unit` opcional/qualquer string (a normalização pro enum `Unit` é do adaptador).
 */
const lineSchema = z
  .object({
    name: z.string().trim().min(1),
    qty: z.coerce.number().optional(),
    unit: z.string().optional(),
  })
  .transform((raw) => ({
    name: raw.name,
    // qty inválida/ausente/fora do range → 1 (edge case do spec).
    qty: typeof raw.qty === 'number' && raw.qty > 0 && raw.qty <= MAX_QTY ? raw.qty : 1,
    unit: raw.unit ?? '',
  }));

/** Formato mínimo da resposta do generateContent que consumimos (texto do 1º candidato). */
interface GenerateResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Extrai e valida as linhas do corpo do generateContent. O modelo devolve o JSON no
 * `parts[0].text` (mesmo com responseMimeType application/json). Qualquer falha de
 * parse/shape retorna null (caller decide retry/502). Array JSON válido mas com linhas
 * inválidas → filtra as ruins e mantém as boas (array vazio é resultado legítimo:
 * "não entendi itens" — a rota responde 200 []).
 */
function parseLines(body: GenerateResponse): GeneratedLine[] | null {
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null; // JSON malformado no texto → caller retry → 502
  }
  if (!Array.isArray(raw)) return null;

  const lines: GeneratedLine[] = [];
  for (const entry of raw) {
    const parsed = lineSchema.safeParse(entry);
    if (parsed.success) lines.push(parsed.data); // descarta linha sem name
  }
  return lines;
}

/**
 * Gera uma lista de compras a partir de um prompt em linguagem natural. Retorna:
 *   - `GeneratedLine[]` (possivelmente vazio) no sucesso;
 *   - `null` sem `GEMINI_API_KEY` (feature desligada → caller 501) OU em qualquer
 *     falha de rede/HTTP/parse (→ caller retry → 502). NUNCA lança.
 */
export async function generateShoppingList(
  prompt: string,
  env: Env = process.env,
): Promise<GeneratedLine[] | null> {
  const key = env.GEMINI_API_KEY;
  if (!key) return null; // env-gate: sem chave, a rota vira 501 ai_unavailable

  const model = env.GEMINI_GENERATE_MODEL || DEFAULT_MODEL;

  try {
    const res = await fetch(`${ENDPOINT_BASE}/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null; // HTTP≠200 → caller retry → 502
    const body = (await res.json()) as GenerateResponse;
    return parseLines(body);
  } catch {
    // Timeout, rede, JSON inválido no envelope — silencioso: a rota decide retry/502.
    return null;
  }
}
