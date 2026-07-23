import { zValidator } from '@hono/zod-validator';
import { NFCE_FREE_QUOTA, NFCE_PRO_QUOTA, parseNfceQr, ufFromChave } from '@grosify/shared';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { matchLinesForHousehold } from '../nfce/match-for-household.js';
import { lookupFor, NfceLookupError, type NfceErrorCode } from '../nfce/index.js';
import { requireHousehold, type HouseholdEnv } from '../middleware/household.js';
import {
  confirmImport,
  countMonthImports,
  findCachedImport,
  type CachedImport,
} from './nfce-import-service.js';
import { runScrapeInBackground, startProcessingImport } from './nfce-import-processor.js';

/**
 * Rotas de import de NFC-e (household-scoped; viewer bloqueado pelo middleware por ser
 * mutação). O servidor só consulta+cacheia a nota (`nfce_imports`); a gravação de
 * preços/itens é do CLIENT via outbox (offline-first) — a rota nunca escreve price_records.
 *
 * Lookup é ASSÍNCRONO (o provider pago faz cold scraping >70s, não cabe numa request):
 *   1. parseNfceQr(qrUrl) → chave/UF (null → 400; UF inválida → 400)
 *   2. CACHE por (household, chave): parsed/confirmed → itens (matching), SEM portal/quota
 *   3. Valida UF/estado SEM I/O (uf_unsupported 422 / state_unsupported 501) — falha rápida
 *   4. QUOTA do mês (só parsed/confirmed contam): Free≥2 → 403; Pro≥60 → 429
 *   5. Gate async (startProcessingImport): dispara o scrape em background → 202 processing;
 *      poll subsequente relê o cache (parsed → itens; failed → nfce_provider_error 502)
 */

/** Erros de validação de QR/chave (client-side, antes de qualquer lookup) → 400. */
type ValidationErrorCode = 'nfce_invalid_qr' | 'nfce_invalid_key';

/**
 * Mapa código tipado → status HTTP. Os do lookup vêm do design (uf_unsupported 422,
 * state_unsupported 501, portal 504, provider 502, parse 422); os de validação são 400.
 */
const ERROR_STATUS: Record<NfceErrorCode | ValidationErrorCode, ContentfulStatusCode> = {
  nfce_invalid_qr: 400,
  nfce_invalid_key: 400,
  uf_unsupported: 422,
  state_unsupported: 501,
  nfce_parse_failed: 422,
  nfce_portal_error: 504,
  nfce_provider_error: 502,
};

const lookupBody = z.object({
  /** rawValue do QR do cupom — a chave/UF são derivadas no servidor (nunca do body). */
  qrUrl: z.string().trim().min(1),
  /** true só no scan inicial do usuário: permite re-disparar uma nota `failed`. Os polls
   *  mandam false — recebem o erro da falha e param (sem re-raspar em loop). */
  retry: z.boolean().optional(),
});

const confirmBody = z.object({
  /** Chave de acesso (44 dígitos) da nota já parseada a confirmar. */
  chave: z.string().trim().regex(/^\d{44}$/),
});

/** Corpo de sucesso (nota pronta): itens brutos + linhas já casadas contra o catálogo. */
async function readyBody(householdId: string, cached: CachedImport) {
  return {
    status: 'ready' as const,
    cached: true,
    alreadyImported: cached.alreadyImported,
    emitente: cached.rawJson.emitente,
    totalCents: cached.rawJson.totalCents,
    // `lines[i]` casa 1:1 com `itens[i]` via lineIndex (matchLinesForHousehold preserva a ordem).
    itens: cached.rawJson.itens,
    lines: await matchLinesForHousehold(householdId, cached.rawJson.itens),
  };
}

export const nfceRoute = new Hono<HouseholdEnv>()
  .use(requireHousehold)

  .post('/lookup', zValidator('json', lookupBody), async (c) => {
    const householdId = c.get('householdId');
    const plan = c.get('plan');
    const { qrUrl, retry } = c.req.valid('json');

    // 1) QR → chave/UF. URL não-SEFAZ / p= inválido / chave ≠ 44 díg. → recusa sem lookup.
    const parsed = parseNfceQr(qrUrl);
    if (!parsed) return c.json({ error: 'nfce_invalid_qr' }, ERROR_STATUS.nfce_invalid_qr);
    const uf = ufFromChave(parsed.chave);
    if (!uf) return c.json({ error: 'nfce_invalid_key' }, ERROR_STATUS.nfce_invalid_key);

    // 2) Cache primeiro — nota imutável: re-scan não re-consulta nem conta quota.
    const cached = await findCachedImport(householdId, parsed.chave);
    if (cached) return c.json(await readyBody(householdId, cached));

    // 3) Valida UF/estado SEM I/O: UF sem suporte (uf_unsupported) ou SE sem token
    //    (state_unsupported) falham rápido e específico, antes de criar pending/background.
    try {
      lookupFor(uf);
    } catch (err) {
      if (err instanceof NfceLookupError) return c.json({ error: err.code, uf }, ERROR_STATUS[err.code]);
      throw err;
    }

    // 4) Quota ANTES de disparar o scrape (não gasta chamada externa). Só parsed/confirmed contam.
    const used = await countMonthImports(householdId);
    if (plan !== 'pro' && used >= NFCE_FREE_QUOTA) return c.json({ error: 'nfce_quota_free' }, 403);
    if (plan === 'pro' && used >= NFCE_PRO_QUOTA) return c.json({ error: 'nfce_quota_pro' }, 429);

    // 5) Gate async: dispara em background, aguarda um já em curso, relê cache, ou reporta falha.
    const decision = await startProcessingImport(householdId, parsed.chave, uf, {
      allowRetryFailed: retry === true,
    });
    if (decision === 'cached') {
      const again = await findCachedImport(householdId, parsed.chave);
      if (again) return c.json(await readyBody(householdId, again));
    }
    if (decision === 'failed') {
      // Scrape anterior falhou e não foi um retry do usuário → erro (o poll para aqui).
      return c.json({ error: 'nfce_provider_error', uf }, ERROR_STATUS.nfce_provider_error);
    }
    if (decision === 'fire') {
      // fire-and-forget: o scrape (>70s) roda fora do request; o client faz polling.
      void runScrapeInBackground(householdId, parsed.chave, uf, parsed.url);
    }
    // 'fire' ou 'processing' → nota em processamento; o client faz polling em /lookup.
    return c.json({ status: 'processing' as const }, 202);
  })

  .post('/confirm', zValidator('json', confirmBody), async (c) => {
    const householdId = c.get('householdId');
    const { chave } = c.req.valid('json');
    // Transição idempotente parsed → confirmed. A gravação de preços/itens é do client
    // (outbox); aqui só marca a nota como confirmada. Nota inexistente/failed → 404.
    const ok = await confirmImport(householdId, chave);
    if (!ok) return c.json({ error: 'nfce_import_not_found' }, 404);
    return c.json({ ok: true });
  })

  .get('/quota', async (c) => {
    const householdId = c.get('householdId');
    const plan = c.get('plan');
    const used = await countMonthImports(householdId);
    return c.json({ used, limit: plan === 'pro' ? NFCE_PRO_QUOTA : NFCE_FREE_QUOTA, plan });
  });
