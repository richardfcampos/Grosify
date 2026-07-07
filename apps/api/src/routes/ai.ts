import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { generateShoppingList } from '../nfce/gemini-generate.js';
import { generatedToNfceItem, matchLinesForHousehold } from '../nfce/match-for-household.js';
import { requireHousehold, type HouseholdEnv } from '../middleware/household.js';
import { rateLimit } from '../middleware/rate-limit.js';

/**
 * Rota de geração de lista por linguagem natural (household-scoped; viewer bloqueado
 * pelo middleware por ser mutação — POST). Diferente do NFC-e, é STATELESS: gera via
 * Gemini + casa contra o catálogo da casa + responde; NÃO persiste nada server-side.
 * A lista/itens/entradas são materializados no CLIENT via Dexie+outbox (o `listId`
 * opcional só ecoa pro client saber o destino — nunca é usado aqui).
 *
 * Ordem dos gates (o custo do Gemini só existe pra Pro dentro do rate limit):
 *   1. rateLimit 10/min por IP — barra loop/abuso ANTES de qualquer gate de negócio
 *   2. zValidator — prompt 3–500 chars (curto→400 prompt_too_short; longo→prompt_too_long)
 *   3. gate Pro — plan≠pro → 403 pro_required (ANTES do Gemini: free não gasta chamada)
 *   4. env-gate — sem GEMINI_API_KEY → 501 ai_unavailable (a geração É a feature; sem fallback)
 *   5. generateShoppingList — null por parse → 1 retry → 502 ai_generation_failed
 *   6. array vazio → 200 {items:[], lines:[]} (não é erro; UI avisa "sem itens")
 *   7. sucesso → adapta + matchLinesForHousehold → 200 {items, lines}
 */

/**
 * Bounds do prompt. `min 3` evita chamada inútil; `max 500` corta abuso/custo. O hook
 * do zValidator mapeia a falha de tamanho pro código tipado que o client traduz.
 */
const MIN_PROMPT = 3;
const MAX_PROMPT = 500;

const generateBody = z.object({
  /** Texto livre do usuário (3–500 chars). Idioma qualquer — o modelo tolera. */
  prompt: z.string().trim().min(MIN_PROMPT).max(MAX_PROMPT),
  /**
   * Destino opcional (lista existente) — só ecoa pro client; a rota é stateless e não
   * grava nada. Presença/ausência não muda a geração.
   */
  listId: z.string().uuid().optional(),
});

export const aiRoute = new Hono<HouseholdEnv>()
  .use(requireHousehold)

  .post(
    '/generate-list',
    rateLimit({ windowMs: 60_000, max: 10 }),
    zValidator('json', generateBody, (result, c) => {
      // Erro de validação → código tipado (o client traduz via t('errors.<code>')).
      // `too_big` no prompt → prompt_too_long; qualquer outra falha (curto, ausente,
      // não-string, listId inválido) → prompt_too_short (default seguro de tamanho).
      if (!result.success) {
        const tooLong = result.error.issues.some(
          (i) => i.code === 'too_big' && i.path[0] === 'prompt',
        );
        return c.json({ error: tooLong ? 'prompt_too_long' : 'prompt_too_short' }, 400);
      }
    }),
    async (c) => {
      // Gate Pro ANTES do Gemini — free recebe paywall, não gasta chamada externa.
      if (c.get('plan') !== 'pro') return c.json({ error: 'pro_required' }, 403);

      // Env-gate explícito: distingue 501 (feature desligada) de 502 (falhou tentando).
      // Não dá pra confiar só no null do cliente — sem chave ele também devolve null.
      if (!process.env.GEMINI_API_KEY) return c.json({ error: 'ai_unavailable' }, 501);

      const householdId = c.get('householdId');
      const { prompt, listId } = c.req.valid('json');

      // 1 retry só quando o cliente devolve null por parse/rede/timeout. Não é loop:
      // 2 tentativas no máx.; persistindo a falha → 502.
      let generated = await generateShoppingList(prompt);
      if (generated === null) generated = await generateShoppingList(prompt);
      if (generated === null) return c.json({ error: 'ai_generation_failed' }, 502);

      // Log de observabilidade: NUNCA o prompt cru (pode ter dado pessoal — LGPD).
      // Household mascarado (6 primeiros chars) + só métricas.
      console.log('[ai:generate-list]', {
        household: householdId.slice(0, 6),
        lineCount: generated.length,
        promptLen: prompt.length,
      });

      // Array vazio é resultado legítimo ("não entendi itens") — 200, UI avisa.
      if (generated.length === 0) return c.json({ items: [], lines: [], prompt, listId });

      // Casa cada linha gerada contra o catálogo da PRÓPRIA casa (reuso do matching do
      // NFC-e via adaptador — `matchItems` só lê descricao). lines[i] ~ items[i] (1:1).
      const items = generated.map(generatedToNfceItem);
      const lines = await matchLinesForHousehold(householdId, items);
      return c.json({ items, lines, prompt, listId });
    },
  );
