import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupFor, NfceLookupError, resetNfceLookup } from './index.js';
import { InfosimplesProvider } from './infosimples-provider.js';

// Chave de Sergipe (código IBGE 28) — a UF vem da chave no adapter.
const CHAVE_SE = '28250714200166000166650010000012341123456789';
const QR_URL = `https://www.nfce.se.gov.br/nfce/qrcode?p=${CHAVE_SE}|3|1`;

/** Resposta de sucesso representativa da API Infosimples (com CPF do consumidor). */
function successBody() {
  return {
    code: 200,
    data: [
      {
        emitente_cnpj: '28.111.222/0001-33',
        emitente_razao_social: 'MERCADINHO ARACAJU LTDA',
        valor_total: '31,40',
        consumidor_cpf: '123.456.789-09', // presente na origem; deve ser descartado
        produtos: [
          {
            codigo: '1',
            descricao: 'BISCOITO RECHEADO 140G',
            quantidade: '2',
            unidade: 'UN',
            valor_unitario: '3,50',
            valor_total_produto: '7,00',
            ean: '7891000100103',
            ncm: '1905.31.00',
          },
          {
            codigo: '2',
            descricao: 'AGUA MINERAL 1,5L',
            quantidade: '4',
            unidade: 'UN',
            valor_unitario: '2,10',
            valor_total_produto: '8,40',
            ean: 'SEM GTIN',
            ncm: '2201.10.00',
          },
          {
            codigo: '3',
            descricao: 'CAFE 250G',
            quantidade: '2',
            unidade: 'UN',
            valor_unitario: '8,00',
            valor_total_produto: '16,00',
          },
        ],
      },
    ],
  };
}

function mockFetchJson(body: unknown) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

afterEach(() => {
  vi.restoreAllMocks();
  resetNfceLookup();
});

describe('InfosimplesProvider — mapeamento da resposta', () => {
  it('mapeia produtos[] pra NfceItem em centavos', async () => {
    mockFetchJson(successBody());
    const provider = new InfosimplesProvider('tok');
    const result = await provider.fetchItems(CHAVE_SE, QR_URL);

    expect(result.itens).toHaveLength(3);
    expect(result.uf).toBe('SE');
  });

  it('converte "3,50" em 350 centavos e total "7,00" em 700 (risco 100x)', async () => {
    mockFetchJson(successBody());
    const result = await new InfosimplesProvider('tok').fetchItems(CHAVE_SE, QR_URL);
    const biscoito = result.itens[0]!;
    expect(biscoito.valorUnitCents).toBe(350);
    expect(biscoito.valorTotalCents).toBe(700);
  });

  it('total da nota "31,40" → 3140 centavos', async () => {
    mockFetchJson(successBody());
    const result = await new InfosimplesProvider('tok').fetchItems(CHAVE_SE, QR_URL);
    expect(result.totalCents).toBe(3140);
  });

  it('mapeia emitente (CNPJ só dígitos + razão social)', async () => {
    mockFetchJson(successBody());
    const result = await new InfosimplesProvider('tok').fetchItems(CHAVE_SE, QR_URL);
    expect(result.emitente.cnpj).toBe('28111222000133');
    expect(result.emitente.nome).toBe('MERCADINHO ARACAJU LTDA');
  });

  it('vincula EAN quando GTIN válido e deixa null em "SEM GTIN"', async () => {
    mockFetchJson(successBody());
    const result = await new InfosimplesProvider('tok').fetchItems(CHAVE_SE, QR_URL);
    expect(result.itens[0]!.ean).toBe('7891000100103');
    expect(result.itens[1]!.ean).toBeNull();
  });

  it('descarta o CPF do consumidor — nenhum campo do resultado o contém (LGPD)', async () => {
    mockFetchJson(successBody());
    const result = await new InfosimplesProvider('tok').fetchItems(CHAVE_SE, QR_URL);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('123.456.789-09');
    expect(serialized).not.toContain('12345678909');
  });

  it('envia a CHAVE pura no parâmetro nfce, NUNCA a URL do QR (a API valida e rejeita a URL v3)', async () => {
    const spy = mockFetchJson(successBody());
    await new InfosimplesProvider('tok').fetchItems(CHAVE_SE, QR_URL);
    const init = spy.mock.calls[0]![1]!;
    const sent = JSON.parse(init.body as string) as { nfce: string };
    expect(sent.nfce).toBe(CHAVE_SE);
    expect(sent.nfce).not.toContain('http'); // regressão pra URL reintroduz o code 607
  });
});

describe('InfosimplesProvider — erros → nfce_provider_error', () => {
  it('code != 200 → nfce_provider_error', async () => {
    mockFetchJson({ code: 612, data: [] });
    try {
      await new InfosimplesProvider('tok').fetchItems(CHAVE_SE, QR_URL);
      expect.unreachable('deveria lançar');
    } catch (err) {
      expect(err).toBeInstanceOf(NfceLookupError);
      expect((err as NfceLookupError).code).toBe('nfce_provider_error');
    }
  });

  it('erro de rede (fetch rejeita) → nfce_provider_error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    try {
      await new InfosimplesProvider('tok').fetchItems(CHAVE_SE, QR_URL);
      expect.unreachable('deveria lançar');
    } catch (err) {
      expect(err).toBeInstanceOf(NfceLookupError);
      expect((err as NfceLookupError).code).toBe('nfce_provider_error');
    }
  });

  it('code 200 mas sem produtos → nfce_provider_error (não itens vazios)', async () => {
    mockFetchJson({ code: 200, data: [{ produtos: [] }] });
    await expect(new InfosimplesProvider('tok').fetchItems(CHAVE_SE, QR_URL)).rejects.toBeInstanceOf(
      NfceLookupError,
    );
  });
});

describe('roteamento env-gated do adapter (registro na família infosimples)', () => {
  it('COM INFOSIMPLES_TOKEN → lookupFor(SE) devolve o adapter', () => {
    const provider = lookupFor('SE', { INFOSIMPLES_TOKEN: 'tok' });
    expect(provider.family).toBe('infosimples');
    expect(provider).toBeInstanceOf(InfosimplesProvider);
  });

  it('SEM INFOSIMPLES_TOKEN → state_unsupported (adapter não instanciável)', () => {
    try {
      lookupFor('SE', {});
      expect.unreachable('deveria lançar');
    } catch (err) {
      expect(err).toBeInstanceOf(NfceLookupError);
      expect((err as NfceLookupError).code).toBe('state_unsupported');
    }
  });
});
