import { and, count, eq, gte, inArray, lt } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { NfceResult } from '../nfce/index.js';
import { db } from '../db/index.js';
import { nfceImports } from '../db/schema.js';

/**
 * Camada de banco da máquina de estados de import de NFC-e (a rota routes/nfce.ts
 * fica só com HTTP/roteamento). Consolida aqui: cache/idempotência por
 * (household, chave), contagem de quota mensal e as transições de status.
 *
 * Máquina: pending (criado) → parsed (itens ok, cache válido) → confirmed (client
 * gravou os preços) OU failed (erro do lookup — NÃO conta quota). O rawJson guarda
 * só itens + emitente (sem CPF do consumidor — o parser já descarta na origem).
 */

/** Status que uma linha de import pode ter (espelha o enum do schema). */
type ImportStatus = 'pending' | 'parsed' | 'confirmed' | 'failed';

/** Só imports que efetivamente consultaram o portal contam pra quota. */
const COUNTED_STATUSES = ['parsed', 'confirmed'] as const;

/** Resultado de um cache hit: o rawJson parseado + se a nota já foi confirmada. */
export interface CachedImport {
  rawJson: NfceResult;
  alreadyImported: boolean;
}

/**
 * Busca no cache uma nota já parseada/confirmada desta casa. Retorna null quando não
 * há registro OU o registro está em pending/failed (não é cache válido — pending é um
 * lookup em andamento; failed é erro que não deve mascarar uma nova tentativa).
 *
 * `alreadyImported` = true só quando status confirmed → o client avisa "nota já
 * importada". Cache hit NUNCA conta quota nem re-consulta o portal (nota é imutável).
 */
export async function findCachedImport(
  householdId: string,
  chave: string,
): Promise<CachedImport | null> {
  const [row] = await db
    .select({ status: nfceImports.status, rawJson: nfceImports.rawJson })
    .from(nfceImports)
    .where(and(eq(nfceImports.householdId, householdId), eq(nfceImports.chave, chave)))
    .limit(1);

  if (!row || !row.rawJson) return null;
  const status = row.status as ImportStatus;
  if (status !== 'parsed' && status !== 'confirmed') return null;

  return {
    rawJson: row.rawJson as NfceResult,
    alreadyImported: status === 'confirmed',
  };
}

/**
 * Conta imports desta casa no MÊS-CALENDÁRIO corrente (UTC) com status parsed/confirmed.
 * failed e pending NÃO contam (erro/portal-fora não consome quota; cache hit também
 * não passa por aqui). Janela [início do mês, início do próximo mês) via createdAt —
 * usa o índice (householdId, createdAt).
 */
export async function countMonthImports(householdId: string, now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [row] = await db
    .select({ n: count() })
    .from(nfceImports)
    .where(
      and(
        eq(nfceImports.householdId, householdId),
        inArray(nfceImports.status, [...COUNTED_STATUSES]),
        gte(nfceImports.createdAt, start),
        lt(nfceImports.createdAt, end),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Grava o resultado de um lookup bem-sucedido como status `parsed` (cache válido +
 * conta pra quota). O unique(household, chave) serializa scans simultâneos da mesma
 * nota — em corrida, o 2º cai em conflito e deve reler do cache (o caller trata).
 * Idempotente por upsert: re-executar sobre a mesma chave atualiza o rawJson.
 */
export async function saveParsedImport(
  householdId: string,
  chave: string,
  result: NfceResult,
): Promise<void> {
  await db
    .insert(nfceImports)
    .values({
      id: uuidv7(),
      householdId,
      chave,
      uf: result.uf,
      storeCnpj: result.emitente.cnpj || null,
      storeName: result.emitente.nome || null,
      status: 'parsed',
      itemCount: result.itens.length,
      rawJson: result,
    })
    .onConflictDoUpdate({
      target: [nfceImports.householdId, nfceImports.chave],
      set: {
        uf: result.uf,
        storeCnpj: result.emitente.cnpj || null,
        storeName: result.emitente.nome || null,
        status: 'parsed',
        itemCount: result.itens.length,
        rawJson: result,
      },
    });
}

/**
 * Registra um lookup que falhou como status `failed` (NÃO conta quota, não vira cache
 * válido). Guarda a UF pra observabilidade; rawJson fica null (não há itens). O código
 * de erro NÃO é persistido (a máquina só precisa do status; o código já foi logado de
 * forma segura pelo caller).
 *
 * Só chega aqui após um cache miss (findCachedImport devolveu null), então nunca há
 * uma linha parsed/confirmed pra rebaixar — o upsert por (household, chave) só cobre a
 * corrida de dois lookups falhos simultâneos da mesma nota.
 */
export async function saveFailedImport(
  householdId: string,
  chave: string,
  uf: string,
): Promise<void> {
  await db
    .insert(nfceImports)
    .values({
      id: uuidv7(),
      householdId,
      chave,
      uf,
      status: 'failed',
      itemCount: 0,
      rawJson: null,
    })
    .onConflictDoUpdate({
      target: [nfceImports.householdId, nfceImports.chave],
      set: { status: 'failed', uf },
    });
}

/**
 * Transiciona uma nota parsed → confirmed (o client já gravou os preços via outbox).
 * Idempotente: confirmar de novo é no-op. Só afeta linhas parsed/confirmed desta casa
 * — nunca "confirma" uma que falhou ou nem existe. Retorna true se havia o que confirmar.
 */
export async function confirmImport(householdId: string, chave: string): Promise<boolean> {
  const rows = await db
    .update(nfceImports)
    .set({ status: 'confirmed' })
    .where(
      and(
        eq(nfceImports.householdId, householdId),
        eq(nfceImports.chave, chave),
        inArray(nfceImports.status, ['parsed', 'confirmed']),
      ),
    )
    .returning({ id: nfceImports.id });
  return rows.length > 0;
}
