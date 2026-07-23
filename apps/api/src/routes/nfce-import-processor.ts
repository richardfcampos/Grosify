import { and, eq, lt, or } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Uf } from '@grosify/shared';
import { db } from '../db/index.js';
import { nfceImports } from '../db/schema.js';
import { logNfceLookup, lookupFor, NfceLookupError } from '../nfce/index.js';
// Auto-registro das famílias de provider (efeito colateral): sem estes imports,
// lookupFor não acha a família e trataria toda UF como uf_unsupported. Ficam aqui
// (e não na rota) porque é aqui que o background chama lookupFor de fato.
import '../nfce/parsers/svrs-parser.js';
import '../nfce/parsers/sp-parser.js';
import '../nfce/parsers/mg-parser.js';
import '../nfce/infosimples-provider.js';
import { saveFailedImport, saveParsedImport } from './nfce-import-service.js';

/**
 * Gate + executor do import ASSÍNCRONO de NFC-e. O provider pago (Infosimples) faz cold
 * scraping >70s — não cabe numa request síncrona (teto de proxy + UX). Então a rota só
 * dispara o scrape aqui em background e responde 202; o client faz polling em /nfce/lookup
 * até o cache virar `parsed` (itens) ou `failed` (erro).
 */

/** Tempo que um `pending` vale como "em andamento" antes de ser tratado como órfão
 *  (processo caiu no meio do scrape) e liberado pra re-disparo. Maior que o teto do
 *  scrape pra nunca cortar um lookup legítimo em curso. */
const STALE_PENDING_MS = 180_000;

/** Decisão do gate pra uma (casa, chave). */
export type ProcessDecision = 'fire' | 'processing' | 'cached' | 'failed';

/**
 * Decide se ESTE request dispara o scrape, aguarda um já em curso, relê do cache, ou
 * reporta falha. Upsert atômico do `pending` por (household, chave): o `setWhere` do ON
 * CONFLICT garante que só um request dispara (dedupe entre polls) e libera re-disparo
 * quando o pending está órfão (processo caiu) OU a nota está `failed` E o usuário pediu
 * retry (novo scan). Poll sobre `failed` (retry=false) devolve 'failed' — o client para.
 */
export async function startProcessingImport(
  householdId: string,
  chave: string,
  uf: Uf,
  opts: { allowRetryFailed: boolean },
  now: Date = new Date(),
): Promise<ProcessDecision> {
  const staleBefore = new Date(now.getTime() - STALE_PENDING_MS);
  const orphanPending = and(eq(nfceImports.status, 'pending'), lt(nfceImports.createdAt, staleBefore));
  const refire = opts.allowRetryFailed
    ? or(eq(nfceImports.status, 'failed'), orphanPending)
    : orphanPending;

  const fired = await db
    .insert(nfceImports)
    .values({ id: uuidv7(), householdId, chave, uf, status: 'pending', itemCount: 0, createdAt: now })
    .onConflictDoUpdate({
      target: [nfceImports.householdId, nfceImports.chave],
      set: { status: 'pending', uf, createdAt: now, rawJson: null, itemCount: 0 },
      setWhere: refire,
    })
    .returning({ id: nfceImports.id });

  // Linha afetada (insert novo OU re-disparo liberado pelo setWhere) → nós disparamos.
  if (fired.length > 0) return 'fire';

  // Conflito sem re-disparo → classifica pelo estado atual.
  const [row] = await db
    .select({ status: nfceImports.status })
    .from(nfceImports)
    .where(and(eq(nfceImports.householdId, householdId), eq(nfceImports.chave, chave)))
    .limit(1);
  if (!row) return 'fire'; // corrida rara: registro sumiu entre as duas queries
  if (row.status === 'parsed' || row.status === 'confirmed') return 'cached';
  if (row.status === 'failed') return 'failed';
  return 'processing';
}

/**
 * Executa o scrape FORA do ciclo do request e resolve o `pending` em `parsed` (sucesso)
 * ou `failed` (erro). NUNCA lança pra fora (o request já respondeu 202) — o resultado
 * chega ao client pelo próximo /nfce/lookup (cache hit → itens; failed → erro). O
 * matching NÃO roda aqui: é feito no request de leitura (cache hit), barato e por-casa.
 *
 * Retorna a Promise (que NUNCA rejeita — erros viram status `failed`) só pra testes
 * conseguirem aguardar o scrape; a rota ignora com `void` (fire-and-forget).
 */
export function runScrapeInBackground(
  householdId: string,
  chave: string,
  uf: Uf,
  qrUrl: string,
): Promise<void> {
  return (async () => {
    const start = Date.now();
    try {
      const provider = lookupFor(uf);
      const result = await provider.fetchItems(chave, qrUrl);
      await saveParsedImport(householdId, chave, result);
      logNfceLookup({
        uf,
        family: provider.family,
        status: 'parsed',
        itemCount: result.itens.length,
        chave,
      });
      console.info(
        '[nfce:debug]',
        JSON.stringify({ event: 'bg_scrape_ok', uf, totalMs: Date.now() - start, itemCount: result.itens.length }),
      );
    } catch (err) {
      const code = err instanceof NfceLookupError ? err.code : 'nfce_provider_error';
      await saveFailedImport(householdId, chave, uf).catch(() => {});
      logNfceLookup({ uf, status: code, chave });
      console.error(
        '[nfce:debug]',
        JSON.stringify({
          event: 'bg_scrape_failed',
          uf,
          totalMs: Date.now() - start,
          code,
          errorName: err instanceof Error ? err.name : 'unknown',
          errorMsg: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  })();
}
