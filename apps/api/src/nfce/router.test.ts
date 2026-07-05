import { NFCE_UF_ROUTES, ufFromChave, type NfceRouteFamily, type Uf } from '@grosify/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  lookupFor,
  NfceLookupError,
  registerNfceProvider,
  resetNfceLookup,
  setNfceLookup,
} from './index.js';
import type { NfceLookup, NfceResult } from './types.js';

// Chaves de 44 dígitos por UF (2 primeiros díg. = código IBGE) — só a UF importa aqui.
const CHAVE_RS = '43250714200166000166650010000012341123456789';
const CHAVE_SP = '35250714200166000166650010000012341123456789';
const CHAVE_MG = '31250714200166000166650010000012341123456789';
const CHAVE_SE = '28250714200166000166650010000012341123456789';
const CHAVE_BA = '29250714200166000166650010000012341123456789';

/** Fake que só carrega a família — o roteador é o alvo, não o fetch. */
function fakeProvider(family: NfceRouteFamily): NfceLookup {
  return {
    family,
    fetchItems: async (): Promise<NfceResult> => {
      throw new Error('fake — não deveria consultar no teste de roteamento');
    },
  };
}

/**
 * Registra fábricas fake pras 3 famílias com parser próprio + a família paga.
 * Espelha como os módulos reais (parsers/*, infosimples-provider) se registram:
 * svrs/sp/mg sempre instanciam; infosimples só com INFOSIMPLES_TOKEN.
 */
function registerFakeFactories(): void {
  registerNfceProvider('svrs', () => fakeProvider('svrs'));
  registerNfceProvider('sp', () => fakeProvider('sp'));
  registerNfceProvider('mg', () => fakeProvider('mg'));
  registerNfceProvider('infosimples', (env) =>
    env.INFOSIMPLES_TOKEN ? fakeProvider('infosimples') : null,
  );
}

describe('lookupFor — roteamento por UF', () => {
  beforeEach(() => {
    resetNfceLookup();
    registerFakeFactories();
  });

  afterEach(() => {
    resetNfceLookup();
  });

  it('RS (chave IBGE 43) → família svrs', () => {
    const uf = ufFromChave(CHAVE_RS) as Uf;
    const provider = lookupFor(uf, {});
    expect(provider.family).toBe('svrs');
  });

  it('SP (chave IBGE 35) → família sp (portal próprio)', () => {
    const uf = ufFromChave(CHAVE_SP) as Uf;
    const provider = lookupFor(uf, {});
    expect(provider.family).toBe('sp');
  });

  it('MG (chave IBGE 31) → família mg (portal próprio)', () => {
    const uf = ufFromChave(CHAVE_MG) as Uf;
    const provider = lookupFor(uf, {});
    expect(provider.family).toBe('mg');
  });

  it('SE (chave IBGE 28) COM INFOSIMPLES_TOKEN → adapter infosimples', () => {
    const uf = ufFromChave(CHAVE_SE) as Uf;
    const provider = lookupFor(uf, { INFOSIMPLES_TOKEN: 'tok' });
    expect(provider.family).toBe('infosimples');
  });

  it('SE SEM INFOSIMPLES_TOKEN → NfceLookupError state_unsupported', () => {
    const uf = ufFromChave(CHAVE_SE) as Uf;
    try {
      lookupFor(uf, {});
      expect.unreachable('deveria lançar');
    } catch (err) {
      expect(err).toBeInstanceOf(NfceLookupError);
      expect((err as NfceLookupError).code).toBe('state_unsupported');
      expect((err as NfceLookupError).uf).toBe('SE');
    }
  });

  it('BA (sem parser nem adapter) → NfceLookupError uf_unsupported com a sigla', () => {
    const uf = ufFromChave(CHAVE_BA) as Uf;
    try {
      lookupFor(uf, {});
      expect.unreachable('deveria lançar');
    } catch (err) {
      expect(err).toBeInstanceOf(NfceLookupError);
      expect((err as NfceLookupError).code).toBe('uf_unsupported');
      expect((err as NfceLookupError).uf).toBe('BA');
    }
  });

  it('a família de BA é "unsupported" na tabela compartilhada (guarda da fixture de roteamento)', () => {
    // Ancora o teste acima na tabela: se alguém ligar BA, este guard quebra e força
    // revisar o teste de uf_unsupported.
    expect(NFCE_UF_ROUTES.BA.family).toBe('unsupported');
  });
});

describe('setNfceLookup — injeção de fake pra testes', () => {
  afterEach(() => {
    resetNfceLookup();
  });

  it('o override vence a tabela pra qualquer UF (inclusive uma unsupported)', () => {
    const fake = fakeProvider('svrs');
    setNfceLookup(fake);
    // BA seria uf_unsupported pela tabela; com override, o fake responde.
    const provider = lookupFor('BA', {});
    expect(provider).toBe(fake);
  });

  it('resetNfceLookup remove o override e volta a rotear pela tabela', () => {
    setNfceLookup(fakeProvider('svrs'));
    resetNfceLookup();
    registerFakeFactories();
    expect(() => lookupFor('BA', {})).toThrow(NfceLookupError);
  });
});
