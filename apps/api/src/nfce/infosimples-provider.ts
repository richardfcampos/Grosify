import { ufFromChave } from '@grosify/shared';
import { registerNfceProvider } from './index.js';
import { NfceLookupError, type NfceItem, type NfceLookup, type NfceResult } from './types.js';
import { brMoneyToCents, brQuantity, digitsOnly } from './parsers/html-parse.js';

/**
 * Adapter Infosimples — consulta NFC-e via API paga, usada só nas UFs bloqueadas pra
 * scraping direto (Sergipe: Turnstile confirmado). ENV-GATED por `INFOSIMPLES_TOKEN`
 * (molde do R2/Turnstile): sem token o provider NÃO é instanciável e o roteador
 * responde `state_unsupported`.
 *
 * A API devolve JSON já estruturado (produtos normalizados). `code === 200` = sucesso;
 * qualquer outro code, timeout ou erro de rede → `nfce_provider_error` (a rota mapeia
 * pra 502, sem consumir quota). CPF do consumidor é descartado (LGPD).
 *
 * Endpoint por UF: api.infosimples.com/api/v2/consultas/sefaz/{uf}/nfce; token no body
 * junto do parâmetro `nfce` (a URL de consulta pública do QR).
 */

// SPEC_DEVIATION: arquivo nomeado *-provider.ts (não *-adapter.ts) pra casar com a
// convenção do módulo billing (asaas-provider.ts) e do email (resend-provider.ts).
// Reason: consistência de nomenclatura de porta no repo; comportamento inalterado.

const BASE_URL = 'https://api.infosimples.com/api/v2/consultas/sefaz';
const TIMEOUT_MS = 20_000; // API paga faz o scraping do lado deles — pode demorar mais.

/** Produto no JSON da Infosimples (só os campos que consumimos). */
interface InfosimplesProduto {
  codigo?: string;
  descricao?: string;
  nome?: string;
  quantidade?: string | number;
  unidade?: string;
  valor_unitario?: string | number;
  valor_total?: string | number;
  valor_total_produto?: string | number;
  ean?: string;
  codigo_ean?: string;
  ncm?: string;
}

interface InfosimplesData {
  emitente_cnpj?: string;
  emitente_razao_social?: string;
  emitente?: { cnpj?: string; razao_social?: string; nome?: string };
  valor_total?: string | number;
  produtos?: InfosimplesProduto[];
}

interface InfosimplesResponse {
  code?: number;
  /** Mensagem legível do code (ex.: "Requisição bem sucedida", "Token inválido"). */
  code_message?: string;
  /** Detalhes de erro quando a consulta falha (ex.: nota não encontrada, captcha). */
  errors?: unknown;
  data?: InfosimplesData[];
}

/** Converte string/number monetário da Infosimples pra centavos. */
function toCents(raw: string | number | undefined): number {
  if (raw === undefined || raw === null) return 0;
  return brMoneyToCents(String(raw));
}

function toQty(raw: string | number | undefined): number {
  if (raw === undefined || raw === null) return 0;
  return brQuantity(String(raw));
}

/** Mapeia um produto da Infosimples pro NfceItem (cents; EAN/NCM opcionais). */
function mapProduto(p: InfosimplesProduto): NfceItem {
  const eanRaw = p.ean ?? p.codigo_ean ?? '';
  const eanDigits = digitsOnly(eanRaw);
  const ean = /^\d{8,14}$/.test(eanDigits) ? eanDigits : null;
  return {
    descricao: p.descricao ?? p.nome ?? '',
    quantidade: toQty(p.quantidade),
    unidade: p.unidade ?? 'UN',
    valorUnitCents: toCents(p.valor_unitario),
    valorTotalCents: toCents(p.valor_total_produto ?? p.valor_total),
    ean,
    ncm: p.ncm ? digitsOnly(p.ncm) : null,
  };
}

export class InfosimplesProvider implements NfceLookup {
  readonly family = 'infosimples' as const;

  constructor(private readonly token: string) {}

  async fetchItems(chave: string, qrUrl: string): Promise<NfceResult> {
    const uf = ufFromChave(chave);
    if (!uf) throw new NfceLookupError('nfce_provider_error');

    // DEBUG_NFCE (temporário): instrumenta a chamada Infosimples pra diagnosticar
    // falhas em prod. Remover quando o import de SE estiver validado.
    const startedAt = Date.now();
    const debug = (event: string, extra: Record<string, unknown> = {}) => {
      console.info(
        '[nfce:debug]',
        JSON.stringify({ event, uf, elapsedMs: Date.now() - startedAt, ...extra }),
      );
    };
    debug('infosimples_request', { endpoint: `${uf.toLowerCase()}/nfce`, qrUrl });

    let body: InfosimplesResponse;
    let httpStatus = 0;
    try {
      const res = await fetch(`${BASE_URL}/${uf.toLowerCase()}/nfce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `nfce` = URL de consulta pública do QR (a Infosimples resolve o portal).
        body: JSON.stringify({ token: this.token, nfce: qrUrl }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      httpStatus = res.status;
      body = (await res.json()) as InfosimplesResponse;
    } catch (e) {
      // Timeout, rede, JSON inválido → erro de provider (rota → 502, sem quota).
      debug('infosimples_fetch_threw', {
        httpStatus,
        errorName: e instanceof Error ? e.name : 'unknown',
        errorMsg: e instanceof Error ? e.message : String(e),
      });
      throw new NfceLookupError('nfce_provider_error', uf);
    }

    debug('infosimples_response', {
      httpStatus,
      apiCode: body.code,
      codeMessage: body.code_message,
      produtosCount: body.data?.[0]?.produtos?.length ?? 0,
      errors: body.errors,
    });

    // Contrato da Infosimples: code 200 = sucesso; qualquer outro é falha da consulta.
    if (body.code !== 200) {
      debug('infosimples_non_200', { apiCode: body.code, codeMessage: body.code_message });
      throw new NfceLookupError('nfce_provider_error', uf);
    }

    const data = body.data?.[0];
    const produtos = data?.produtos ?? [];
    if (!data || produtos.length === 0) {
      // Sem produtos = consulta não trouxe a nota → trata como falha de provider.
      debug('infosimples_empty', { hasData: !!data, produtosCount: produtos.length });
      throw new NfceLookupError('nfce_provider_error', uf);
    }

    debug('infosimples_ok', { produtosCount: produtos.length });

    const itens = produtos.map(mapProduto);
    const cnpj = digitsOnly(data.emitente_cnpj ?? data.emitente?.cnpj ?? '');
    const nome = data.emitente_razao_social ?? data.emitente?.razao_social ?? data.emitente?.nome ?? '';
    const totalCents = data.valor_total
      ? toCents(data.valor_total)
      : itens.reduce((acc, item) => acc + item.valorTotalCents, 0);

    return { emitente: { cnpj, nome }, itens, totalCents, uf };
  }
}

/**
 * Fábrica registrada na família `infosimples`: instancia o adapter SÓ com token.
 * Sem `INFOSIMPLES_TOKEN`, retorna null → o roteador responde `state_unsupported`.
 */
registerNfceProvider('infosimples', (env) =>
  env.INFOSIMPLES_TOKEN ? new InfosimplesProvider(env.INFOSIMPLES_TOKEN) : null,
);
