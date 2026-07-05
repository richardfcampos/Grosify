import { NFCE_UF_ROUTES, type Uf } from '@grosify/shared';
import type { NfceLookup } from './types.js';
import { NfceLookupError } from './types.js';

export type { NfceEmitente, NfceErrorCode, NfceItem, NfceLookup, NfceResult } from './types.js';
export { NfceLookupError } from './types.js';
export { logNfceLookup, maskChave, type NfceLogFields } from './nfce-log.js';

type Env = Record<string, string | undefined>;

/**
 * Roteador de lookup de NFC-e — ÚNICO lugar que conhece as famílias concretas.
 * Resolve a família da UF via `NFCE_UF_ROUTES` (tabela compartilhada) e devolve o
 * provider certo:
 *   svrs/sp/mg  → parser próprio (fetch + parse do HTML do portal)
 *   infosimples → adapter pago, SÓ se INFOSIMPLES_TOKEN; senão `state_unsupported`
 *   unsupported → `uf_unsupported`
 *
 * Espelha billing/index.ts (factory por moeda) e email/index.ts (factory por env).
 * Os providers concretos se registram via `registerNfceProvider` no seu próprio
 * módulo (parsers/*, infosimples-provider) — assim adicionar UF nova não toca aqui.
 */

/** Fábricas de provider por família — preenchidas pelos módulos concretos (T4/T5). */
type ProviderFactory = (env: Env) => NfceLookup | null;
const factories = new Map<string, ProviderFactory>();

/**
 * Registra a fábrica de uma família. `svrs/sp/mg` sempre instanciam; `infosimples`
 * retorna null quando o token está ausente (o roteador converte em state_unsupported).
 */
export function registerNfceProvider(family: string, factory: ProviderFactory): void {
  factories.set(family, factory);
}

/**
 * Resolve o provider de lookup pra uma UF. Lança `NfceLookupError` tipado quando a
 * UF não é atendida (uf_unsupported) ou é Sergipe sem token (state_unsupported) —
 * a rota traduz o código em status HTTP + `errors.*`.
 */
export function lookupFor(uf: Uf, env: Env = process.env): NfceLookup {
  // Override de teste vence a tabela — injeta um fake sem tocar em fetch real.
  if (override) return override;

  const route = NFCE_UF_ROUTES[uf];
  if (route.family === 'unsupported') {
    throw new NfceLookupError('uf_unsupported', uf);
  }

  const factory = factories.get(route.family);
  // Família na tabela mas sem provider registrado = configuração incompleta; trata
  // como UF sem suporte (na prática só ocorre se um módulo não foi importado).
  if (!factory) {
    throw new NfceLookupError('uf_unsupported', uf);
  }

  const provider = factory(env);
  // Adapter pago sem credencial (INFOSIMPLES_TOKEN ausente) → estado ainda não ligado.
  if (!provider) {
    throw new NfceLookupError('state_unsupported', uf);
  }

  return provider;
}

// Injeção pra testes — um único slot (o fake responde por qualquer UF). Espelha
// setEmailProvider/setBillingProvider. Registrado vence a tabela até o reset.
let override: NfceLookup | null = null;

export function setNfceLookup(provider: NfceLookup): void {
  override = provider;
}

export function resetNfceLookup(): void {
  override = null;
}
