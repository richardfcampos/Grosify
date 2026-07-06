import { zValidator } from '@hono/zod-validator';
import { NFCE_FREE_QUOTA, NFCE_PRO_QUOTA, parseNfceQr, ufFromChave } from '@grosify/shared';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import {
  embedAndCacheCatalog,
  loadCatalog,
} from '../nfce/embed-cache.js';
import {
  logNfceLookup,
  lookupFor,
  matchItems,
  NfceLookupError,
  type NfceErrorCode,
} from '../nfce/index.js';
// Importa os provedores concretos pelo efeito colateral de auto-registro na factory
// do roteador (registerNfceProvider). Sem estes imports, lookupFor não acha a família
// e trataria toda UF como uf_unsupported. Espelha como os testes de rota registram fakes.
import '../nfce/parsers/svrs-parser.js';
import '../nfce/parsers/sp-parser.js';
import '../nfce/parsers/mg-parser.js';
import '../nfce/infosimples-provider.js';
import { requireHousehold, type HouseholdEnv } from '../middleware/household.js';
import {
  confirmImport,
  countMonthImports,
  findCachedImport,
  saveFailedImport,
  saveParsedImport,
} from './nfce-import-service.js';

/**
 * Rotas de import de NFC-e (household-scoped; viewer bloqueado pelo middleware por ser
 * mutação). O servidor só consulta+cacheia a nota (`nfce_imports`); a gravação de
 * preços/itens é do CLIENT via outbox (offline-first) — a rota nunca escreve price_records.
 *
 * Fluxo do lookup (ordem importa pro gate de custo):
 *   1. parseNfceQr(qrUrl) → chave/UF (null → 400 nfce_invalid_qr; UF inválida → 400 nfce_invalid_key)
 *   2. CACHE por (household, chave): parsed/confirmed → devolve rawJson, SEM portal e SEM quota
 *   3. QUOTA do mês (só parsed/confirmed contam): Free≥2 → 403; Pro≥60 → 429 — ANTES do portal
 *   4. lookupFor(uf).fetchItems → matchItems contra o catálogo → grava parsed → responde
 *   5. NfceLookupError → grava failed (não conta quota) + HTTP do mapa abaixo
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
});

const confirmBody = z.object({
  /** Chave de acesso (44 dígitos) da nota já parseada a confirmar. */
  chave: z.string().trim().regex(/^\d{44}$/),
});

export const nfceRoute = new Hono<HouseholdEnv>()
  .use(requireHousehold)

  .post('/lookup', zValidator('json', lookupBody), async (c) => {
    const householdId = c.get('householdId');
    const plan = c.get('plan');
    const { qrUrl } = c.req.valid('json');

    // 1) QR → chave. URL não-SEFAZ / p= inválido / chave ≠ 44 díg. → recusa sem lookup.
    const parsed = parseNfceQr(qrUrl);
    if (!parsed) return c.json({ error: 'nfce_invalid_qr' }, ERROR_STATUS.nfce_invalid_qr);

    const uf = ufFromChave(parsed.chave);
    // 44 díg. mas dígitos 1-2 não são código IBGE válido → chave irreconhecível.
    if (!uf) return c.json({ error: 'nfce_invalid_key' }, ERROR_STATUS.nfce_invalid_key);

    // 2) Cache primeiro — nota imutável: re-scan não re-consulta nem conta quota.
    const cached = await findCachedImport(householdId, parsed.chave);
    if (cached) {
      return c.json({
        cached: true,
        alreadyImported: cached.alreadyImported,
        emitente: cached.rawJson.emitente,
        totalCents: cached.rawJson.totalCents,
        // Itens brutos (qty/valor/EAN) pra revisão editável no client — `lines[i]`
        // casa 1:1 com `itens[i]` via lineIndex (matchItemsForHousehold preserva a ordem).
        itens: cached.rawJson.itens,
        lines: await matchItemsForHousehold(householdId, cached.rawJson.itens),
      });
    }

    // 3) Quota ANTES do portal (não gasta chamada externa). Só parsed/confirmed contam.
    const used = await countMonthImports(householdId);
    if (plan !== 'pro' && used >= NFCE_FREE_QUOTA) {
      return c.json({ error: 'nfce_quota_free' }, 403);
    }
    if (plan === 'pro' && used >= NFCE_PRO_QUOTA) {
      return c.json({ error: 'nfce_quota_pro' }, 429);
    }

    // 4) Consulta o portal/adapter. Erro tipado → status failed (não conta quota) + HTTP.
    try {
      const provider = lookupFor(uf);
      const result = await provider.fetchItems(parsed.chave, parsed.url);
      logNfceLookup({
        uf,
        family: provider.family,
        status: 'parsed',
        itemCount: result.itens.length,
        chave: parsed.chave,
      });

      await saveParsedImport(householdId, parsed.chave, result);
      return c.json({
        cached: false,
        alreadyImported: false,
        emitente: result.emitente,
        totalCents: result.totalCents,
        itens: result.itens,
        lines: await matchItemsForHousehold(householdId, result.itens),
      });
    } catch (err) {
      // Só NfceLookupError é esperado aqui; qualquer outro erro sobe (bug → 500).
      if (!(err instanceof NfceLookupError)) throw err;
      logNfceLookup({ uf, status: err.code, chave: parsed.chave });
      await saveFailedImport(householdId, parsed.chave, uf);
      return c.json({ error: err.code, uf }, ERROR_STATUS[err.code]);
    }
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

/**
 * Casa os itens da nota contra o catálogo da casa: garante o cache de embedding do
 * catálogo antes (quando `GEMINI_API_KEY`; sem chave é no-op e o matching cai pra fuzzy),
 * depois roda matchItems. Isolado pra reuso entre o caminho de cache e o de lookup fresco.
 */
async function matchItemsForHousehold(
  householdId: string,
  itens: Parameters<typeof matchItems>[0],
) {
  const catalog = await loadCatalog(householdId);
  const withEmbeddings = await embedAndCacheCatalog(householdId, catalog);
  return matchItems(itens, withEmbeddings);
}
