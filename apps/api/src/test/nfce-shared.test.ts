import {
  NFCE_FREE_QUOTA,
  NFCE_PRO_QUOTA,
  NFCE_UF_ROUTES,
  nfceQuota,
  normalizeDescription,
  parseNfceQr,
  ufFromChave,
} from '@grosify/shared';
import { describe, expect, it } from 'vitest';

// Chave de 44 dígitos válida pra RS (código IBGE 43) usada nos fixtures abaixo.
const CHAVE_RS = '43250714200166000166650010000012341123456789';
const CHAVE_SP = '35250714200166000166650010000012341123456789';
const CHAVE_MG = '31250714200166000166650010000012341123456789';
const CHAVE_SE = '28250714200166000166650010000012341123456789';
const CHAVE_BA = '29250714200166000166650010000012341123456789';

describe('parseNfceQr — extração da chave a partir da URL do QR', () => {
  it('v2 online (chave|2|tpAmb|idCSC|hash) — 5 campos, formato padrão de emissão normal', () => {
    const url = `https://www.sefazvirtual.rs.gov.br/qrcode?p=${CHAVE_RS}|2|1|1|A1B2C3D4E5F6`;
    expect(parseNfceQr(url)).toEqual({ chave: CHAVE_RS, url });
  });

  it('v2 com 6 campos (variação de emissor aceita)', () => {
    const url = `https://www.sefazvirtual.rs.gov.br/qrcode?p=${CHAVE_RS}|2|1|1|A1B2C3D4E5F6|0`;
    expect(parseNfceQr(url)).toEqual({ chave: CHAVE_RS, url });
  });

  it('v2 contingência offline com 8 campos (teto aceito)', () => {
    const url = `https://www.sefazvirtual.rs.gov.br/qrcode?p=${CHAVE_RS}|2|1|1|A1B2C3D4E5F6|0|extra|extra2`;
    expect(parseNfceQr(url)).toEqual({ chave: CHAVE_RS, url });
  });

  it('v3 (chave|3|tpAmb) — obrigatório desde nov/2025 — portal SP', () => {
    const url = `https://www.nfce.fazenda.sp.gov.br/consulta?p=${CHAVE_SP}|3|1`;
    expect(parseNfceQr(url)).toEqual({ chave: CHAVE_SP, url });
  });

  it('v3 com campos extras além dos 3 mínimos', () => {
    const url = `https://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=${CHAVE_MG}|3|1|extra`;
    expect(parseNfceQr(url)).toEqual({ chave: CHAVE_MG, url });
  });

  it('rejeita URL de host que não é portal SEFAZ conhecido', () => {
    const url = `https://example.com/qrcode?p=${CHAVE_RS}|2|1|1|hash`;
    expect(parseNfceQr(url)).toBeNull();
  });

  it('rejeita URL sem parâmetro p=', () => {
    expect(parseNfceQr('https://www.sefazvirtual.rs.gov.br/qrcode?x=1')).toBeNull();
  });

  it('rejeita quando a chave não tem 44 dígitos', () => {
    const url = 'https://www.sefazvirtual.rs.gov.br/qrcode?p=12345|2|1|1|hash';
    expect(parseNfceQr(url)).toBeNull();
  });

  it('rejeita versão de QR desconhecida (nem 2 nem 3)', () => {
    const url = `https://www.sefazvirtual.rs.gov.br/qrcode?p=${CHAVE_RS}|9|1`;
    expect(parseNfceQr(url)).toBeNull();
  });

  it('rejeita v2 com menos de 5 campos (online exige chave|2|tpAmb|idCSC|hash)', () => {
    const url = `https://www.sefazvirtual.rs.gov.br/qrcode?p=${CHAVE_RS}|2|1`;
    expect(parseNfceQr(url)).toBeNull();
  });

  it('rejeita string que não é URL', () => {
    expect(parseNfceQr('não é uma url')).toBeNull();
  });

  it('rejeita rawValue de código de produto (não-URL numérico simples)', () => {
    expect(parseNfceQr('7891234567890')).toBeNull();
  });
});

describe('ufFromChave — 2 primeiros dígitos = código IBGE', () => {
  it.each([
    [CHAVE_RS, 'RS'],
    [CHAVE_SP, 'SP'],
    [CHAVE_MG, 'MG'],
    [CHAVE_SE, 'SE'],
    [CHAVE_BA, 'BA'],
  ])('%s → %s', (chave, uf) => {
    expect(ufFromChave(chave)).toBe(uf);
  });

  it('cobre as 27 UFs (tabela completa)', () => {
    const codes = [
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '21',
      '22',
      '23',
      '24',
      '25',
      '26',
      '27',
      '28',
      '29',
      '31',
      '32',
      '33',
      '35',
      '41',
      '42',
      '43',
      '50',
      '51',
      '52',
      '53',
    ];
    for (const code of codes) {
      const chave = code + '0'.repeat(42);
      expect(ufFromChave(chave)).not.toBeNull();
    }
  });

  it('retorna null pra código IBGE inexistente', () => {
    const chave = '99' + '0'.repeat(42);
    expect(ufFromChave(chave)).toBeNull();
  });

  it('retorna null se a chave não tem 44 dígitos', () => {
    expect(ufFromChave('4325071420016600016665001000001234')).toBeNull();
  });
});

describe('NFCE_UF_ROUTES — roteamento por família', () => {
  it('RS é atendido pela família svrs', () => {
    expect(NFCE_UF_ROUTES.RS.family).toBe('svrs');
  });

  it('SP é atendido pela família sp (portal próprio)', () => {
    expect(NFCE_UF_ROUTES.SP.family).toBe('sp');
  });

  it('MG é atendido pela família mg (portal próprio)', () => {
    expect(NFCE_UF_ROUTES.MG.family).toBe('mg');
  });

  it('SE é atendido via adapter infosimples', () => {
    expect(NFCE_UF_ROUTES.SE.family).toBe('infosimples');
  });

  it('BA (sem parser/adapter) é unsupported', () => {
    expect(NFCE_UF_ROUTES.BA.family).toBe('unsupported');
  });

  it('todas as 27 UFs têm entrada na tabela', () => {
    const ufs = Object.keys(NFCE_UF_ROUTES);
    expect(ufs).toHaveLength(27);
  });
});

describe('normalizeDescription — determinístico', () => {
  it('"ARROZ TP1 5KG CAMIL" → "ARROZ CAMIL"', () => {
    expect(normalizeDescription('ARROZ TP1 5KG CAMIL')).toBe('ARROZ CAMIL');
  });

  it('remove acentos e uppercase', () => {
    expect(normalizeDescription('açúcar refinado')).toBe('ACUCAR REFINADO');
  });

  it('colapsa espaços múltiplos', () => {
    expect(normalizeDescription('FEIJAO   CARIOCA  1KG')).toBe('FEIJAO CARIOCA');
  });

  it('remove unidade solta em ML', () => {
    expect(normalizeDescription('REFRIGERANTE COCA COLA 350ML LATA')).toBe(
      'REFRIGERANTE COCA COLA LATA',
    );
  });

  it('remove fracionamento C/N', () => {
    expect(normalizeDescription('IOGURTE C/12 900G NESTLE')).toBe('IOGURTE NESTLE');
  });

  it('remove multiplicador NxM', () => {
    expect(normalizeDescription('CERVEJA 6X350ML SKOL')).toBe('CERVEJA SKOL');
  });

  it('é determinístico (mesma entrada, mesma saída)', () => {
    const input = 'MACARRAO ESPAGUETE 500G RENATA';
    expect(normalizeDescription(input)).toBe(normalizeDescription(input));
  });

  it('expande abreviação comum (LTE → LEITE)', () => {
    expect(normalizeDescription('LTE INTEGRAL 1L PIRACANJUBA')).toBe('LEITE INTEGRAL PIRACANJUBA');
  });
});

describe('quota por plano', () => {
  it('Free = 2', () => {
    expect(nfceQuota('free')).toBe(NFCE_FREE_QUOTA);
    expect(nfceQuota('free')).toBe(2);
  });

  it('Pro = 60', () => {
    expect(nfceQuota('pro')).toBe(NFCE_PRO_QUOTA);
    expect(nfceQuota('pro')).toBe(60);
  });
});
