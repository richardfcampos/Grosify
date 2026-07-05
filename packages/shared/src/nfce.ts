import type { Plan } from './plans.js';

/**
 * Parsing puro de NFC-e (cupom fiscal, modelo 65) — sem I/O.
 * A chave de acesso (44 dígitos) e a UF emissora vêm do QR do cupom;
 * o roteamento por UF e o parse do HTML do portal ficam em `apps/api/src/nfce`.
 */

// ===== Chave + roteamento por UF =====

export interface ParsedNfceQr {
  /** Chave de acesso: 44 dígitos numéricos. */
  chave: string;
  /** URL completa escaneada no QR (repassada ao lookup do portal). */
  url: string;
}

/**
 * Extrai a chave de acesso do QR de uma NFC-e.
 *
 * O QR do DANFE traz uma URL de consulta do portal da SEFAZ com um parâmetro
 * `p=` cujo valor é pipe-separated. O 1º campo é SEMPRE a chave (44 dígitos),
 * em ambas as versões vigentes:
 *   v2: chave|2|tpAmb|idCSC|hash        (5 campos online; contingência offline chega a 8)
 *   v3: chave|3|tpAmb                    (3+ campos, obrigatório desde nov/2025)
 *
 * Retorna null (→ `nfce_invalid_qr`) se a URL não é de um portal SEFAZ conhecido
 * OU não tem `p=` válido OU o 1º campo não tem exatamente 44 dígitos.
 */
export function parseNfceQr(rawValue: string): ParsedNfceQr | null {
  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    return null;
  }

  // Só aceita host de portal SEFAZ conhecido — evita tratar QR de produto/URL
  // qualquer como nota fiscal.
  if (!isKnownSefazHost(url.hostname)) return null;

  const p = url.searchParams.get('p');
  if (!p) return null;

  const fields = p.split('|');
  // v2 online tem 5 campos (chave|2|tpAmb|idCSC|hash); contingência offline vai a 8.
  // v3 tem 3+ (chave|3|tpAmb[|...]). Não somos o validador fiscal — basta chave válida
  // e versão conhecida; contagem estrita rejeitaria notas reais por variação de emissor.
  if (fields.length < 3) return null;

  const chave = fields[0] ?? '';
  if (!/^\d{44}$/.test(chave)) return null;

  const versao = fields[1];
  if (versao === '2') {
    if (fields.length < 5 || fields.length > 8) return null;
  } else if (versao === '3') {
    if (fields.length < 3) return null;
  } else {
    return null;
  }

  return { chave, url: rawValue };
}

/** Hosts dos portais de consulta pública de NFC-e conhecidos (SVRS + próprios + Infosimples-alvo). */
const KNOWN_SEFAZ_HOSTS = [
  // SVRS — portal compartilhado por RS e as UFs conveniadas
  'www.sefazvirtual.rs.gov.br',
  'nfce.sefazvirtual.rs.gov.br',
  // SP — portal próprio
  'www.nfce.fazenda.sp.gov.br',
  'nfce.fazenda.sp.gov.br',
  // MG — portal próprio
  'nfce.fazenda.mg.gov.br',
  'www.fazenda.mg.gov.br',
  // SE — mesmo host SVRS na prática, mas roteado via adapter pago (Turnstile)
  'www.nfce.se.gov.br',
] as const;

function isKnownSefazHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return KNOWN_SEFAZ_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
}

/** Sigla de UF suportada pela feature (as 27 unidades federativas). */
export type Uf =
  | 'RO'
  | 'AC'
  | 'AM'
  | 'RR'
  | 'PA'
  | 'AP'
  | 'TO'
  | 'MA'
  | 'PI'
  | 'CE'
  | 'RN'
  | 'PB'
  | 'PE'
  | 'AL'
  | 'SE'
  | 'BA'
  | 'MG'
  | 'ES'
  | 'RJ'
  | 'SP'
  | 'PR'
  | 'SC'
  | 'RS'
  | 'MS'
  | 'MT'
  | 'GO'
  | 'DF';

/** Código IBGE (2 primeiros dígitos da chave de acesso) → sigla da UF. */
const IBGE_UF_CODE: Record<string, Uf> = {
  '11': 'RO',
  '12': 'AC',
  '13': 'AM',
  '14': 'RR',
  '15': 'PA',
  '16': 'AP',
  '17': 'TO',
  '21': 'MA',
  '22': 'PI',
  '23': 'CE',
  '24': 'RN',
  '25': 'PB',
  '26': 'PE',
  '27': 'AL',
  '28': 'SE',
  '29': 'BA',
  '31': 'MG',
  '32': 'ES',
  '33': 'RJ',
  '35': 'SP',
  '41': 'PR',
  '42': 'SC',
  '43': 'RS',
  '50': 'MS',
  '51': 'MT',
  '52': 'GO',
  '53': 'DF',
};

/**
 * Resolve a UF emissora a partir dos 2 primeiros dígitos da chave (código IBGE).
 * Retorna null (→ `nfce_invalid_key`) se o código não é uma UF válida.
 */
export function ufFromChave(chave: string): Uf | null {
  if (!/^\d{44}$/.test(chave)) return null;
  const code = chave.slice(0, 2);
  return IBGE_UF_CODE[code] ?? null;
}

/** Família de implementação que atende uma UF. */
export type NfceRouteFamily = 'svrs' | 'sp' | 'mg' | 'infosimples' | 'unsupported';

export interface NfceUfRoute {
  /** URL base de consulta pública do portal (fetch server-side aponta pra cá). */
  consultaUrl: string;
  family: NfceRouteFamily;
}

/**
 * Tabela de roteamento por UF — cópia embutida (não runtime-dependency) de
 * `uri_consulta_nfce.json` (sped-nfe). SVRS cobre RS + UFs conveniadas nesse
 * portal compartilhado; SP e MG têm portal próprio; SE tem Turnstile confirmado
 * (adapter pago via Infosimples); demais UFs ficam `unsupported` até termos
 * parser/adapter — mudar a família aqui é a única alteração pra suportar UF nova.
 */
export const NFCE_UF_ROUTES: Record<Uf, NfceUfRoute> = {
  RS: { consultaUrl: 'https://www.sefazvirtual.rs.gov.br/qrcode', family: 'svrs' },
  AC: { consultaUrl: 'https://www.sefazvirtual.rs.gov.br/qrcode', family: 'svrs' },
  AP: { consultaUrl: 'https://www.sefazvirtual.rs.gov.br/qrcode', family: 'svrs' },
  PB: { consultaUrl: 'https://www.sefazvirtual.rs.gov.br/qrcode', family: 'svrs' },
  RR: { consultaUrl: 'https://www.sefazvirtual.rs.gov.br/qrcode', family: 'svrs' },
  RO: { consultaUrl: 'https://www.sefazvirtual.rs.gov.br/qrcode', family: 'svrs' },
  SC: { consultaUrl: 'https://www.sefazvirtual.rs.gov.br/qrcode', family: 'svrs' },
  ES: { consultaUrl: 'https://www.sefazvirtual.rs.gov.br/qrcode', family: 'svrs' },
  PI: { consultaUrl: 'https://www.sefazvirtual.rs.gov.br/qrcode', family: 'svrs' },
  MA: { consultaUrl: 'https://www.sefazvirtual.rs.gov.br/qrcode', family: 'svrs' },
  PA: { consultaUrl: 'https://www.sefazvirtual.rs.gov.br/qrcode', family: 'svrs' },
  AL: { consultaUrl: 'https://www.sefazvirtual.rs.gov.br/qrcode', family: 'svrs' },
  DF: { consultaUrl: 'https://www.sefazvirtual.rs.gov.br/qrcode', family: 'svrs' },
  SP: { consultaUrl: 'https://www.nfce.fazenda.sp.gov.br/consulta', family: 'sp' },
  MG: { consultaUrl: 'https://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml', family: 'mg' },
  SE: { consultaUrl: 'https://www.nfce.se.gov.br/nfce/qrcode', family: 'infosimples' },
  // Demais UFs: sem parser próprio nem adapter até termos suporte confirmado —
  // "unsupported" é a escolha segura (na dúvida, é só mudar a tabela depois).
  AM: { consultaUrl: '', family: 'unsupported' },
  TO: { consultaUrl: '', family: 'unsupported' },
  CE: { consultaUrl: '', family: 'unsupported' },
  RN: { consultaUrl: '', family: 'unsupported' },
  PE: { consultaUrl: '', family: 'unsupported' },
  BA: { consultaUrl: '', family: 'unsupported' },
  RJ: { consultaUrl: '', family: 'unsupported' },
  PR: { consultaUrl: '', family: 'unsupported' },
  MS: { consultaUrl: '', family: 'unsupported' },
  MT: { consultaUrl: '', family: 'unsupported' },
  GO: { consultaUrl: '', family: 'unsupported' },
};

// ===== Normalização de descrição de cupom =====

/** Mapa de acentos comuns em cupons fiscais (evita depender de normalize + regex unicode). */
const ACCENT_MAP: Record<string, string> = {
  Á: 'A',
  À: 'A',
  Â: 'A',
  Ã: 'A',
  Ä: 'A',
  É: 'E',
  È: 'E',
  Ê: 'E',
  Ë: 'E',
  Í: 'I',
  Ì: 'I',
  Î: 'I',
  Ï: 'I',
  Ó: 'O',
  Ò: 'O',
  Ô: 'O',
  Õ: 'O',
  Ö: 'O',
  Ú: 'U',
  Ù: 'U',
  Û: 'U',
  Ü: 'U',
  Ç: 'C',
  Ñ: 'N',
};

function stripAccents(s: string): string {
  return s.replace(/[ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]/g, (c) => ACCENT_MAP[c] ?? c);
}

/**
 * Tokens de unidade/embalagem comuns em descrições de cupom fiscal — removidos
 * antes do matching pra sobrar só o "nome" do produto. Ex.: unidade colada a
 * número (5KG, 900ML), tipo/tamanho (TP1, TP2), múltiplos (2X, 6X300),
 * fracionamento ("C/12"), e a unidade solta (KG, UN, LT).
 */
const UNIT_TOKEN_PATTERNS = [
  /\b\d+(?:[.,]\d+)?\s*(?:KG|G|ML|L|LT|UN|PCT|CX|GR)\b/g, // "5KG", "900ML", "12 UN"
  /\bTP\d+\b/g, // "TP1", "TP2" (tipo/embalagem)
  /\bC\/\s*\d+\b/g, // "C/12" (contém N unidades)
  /\b\d+\s*X\s*\d+(?:[.,]\d+)?(?:KG|G|ML|L|LT|UN)?\b/g, // "6X300", "2X1L"
  /\b(?:KG|GR|G|ML|LT|L|UN|PCT|CX)\b/g, // unidade solta remanescente
];

/** Dicionário mínimo de abreviações BR comuns em cupom fiscal (aplicado pós-normalização). */
const ABBREVIATION_MAP: Record<string, string> = {
  LTE: 'LEITE',
  REFRIG: 'REFRIGERANTE',
  CERV: 'CERVEJA',
  FGO: 'FRANGO',
  ACUC: 'ACUCAR',
  ARR: 'ARROZ',
  FEIJ: 'FEIJAO',
  MACARR: 'MACARRAO',
  BISC: 'BISCOITO',
  CHOC: 'CHOCOLATE',
  DETERG: 'DETERGENTE',
  SAB: 'SABAO',
  PAP: 'PAPEL',
};

/**
 * Normaliza descrição de cupom fiscal pra matching determinístico: uppercase,
 * remove acentos, colapsa espaços, e descarta tokens de unidade/embalagem
 * (KG, G, ML, L, UN, PCT, CX, LT, TP\d+, C/\d+, \d+X\d+ etc.).
 *
 * Ex.: "ARROZ TP1 5KG CAMIL" → "ARROZ CAMIL"
 */
export function normalizeDescription(desc: string): string {
  let s = stripAccents(desc.toUpperCase());
  for (const pattern of UNIT_TOKEN_PATTERNS) {
    s = s.replace(pattern, ' ');
  }
  s = s
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ABBREVIATION_MAP[token] ?? token)
    .join(' ');
  return s.replace(/\s+/g, ' ').trim();
}

// ===== Quota mensal por plano =====

/** Free: degustação — mostra o valor, cria motivo de assinar. */
export const NFCE_FREE_QUOTA = 2;
/** Pro: fair-use invisível — teto de custo (Infosimples/Gemini), nunca anunciado. */
export const NFCE_PRO_QUOTA = 60;

/** Teto de imports por mês-calendário conforme o plano da casa. */
export function nfceQuota(plan: Plan): number {
  return plan === 'pro' ? NFCE_PRO_QUOTA : NFCE_FREE_QUOTA;
}
