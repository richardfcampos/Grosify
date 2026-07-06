import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmNfce, isNfceQr, lookupNfce, NfceImportError } from './nfce-import.js';

// URL de consulta SVRS válida (host conhecido + p= v3: chave|3|tpAmb) — mesmo padrão
// usado nos testes de rota da API (nfce-routes.test.ts).
const CHAVE_RS = '43250714200166000166650010000012341123456789';
const QR_SEFAZ = `https://www.sefazvirtual.rs.gov.br/NFCE/consulta?p=${CHAVE_RS}|3|1`;
const QR_PRODUTO = 'https://exemplo.com/produto/123'; // QR qualquer, não é nota SEFAZ

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('isNfceQr — NFCE-01 AC1', () => {
  it('reconhece QR de NFC-e (host SEFAZ + chave válida)', () => {
    expect(isNfceQr(QR_SEFAZ)).toBe(true);
  });

  it('não reconhece QR de produto (host qualquer)', () => {
    expect(isNfceQr(QR_PRODUTO)).toBe(false);
  });
});

describe('lookupNfce — dispara POST /nfce/lookup só pra QR de nota', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('QR SEFAZ válido → chama o lookup e devolve lines/emitente/totalCents', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        cached: false,
        alreadyImported: false,
        emitente: { cnpj: '11222333000181', nome: 'Mercado Teste' },
        totalCents: 4770,
        itens: [
          {
            descricao: 'ARROZ TP1 5KG CAMIL',
            quantidade: 1,
            unidade: 'UN',
            valorUnitCents: 2990,
            valorTotalCents: 2990,
            ean: '7896006711221',
          },
        ],
        lines: [
          { lineIndex: 0, itemId: null, confidence: 0, method: null, suggestedName: 'ARROZ TP1 5KG CAMIL' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupNfce(QR_SEFAZ);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.chave).toBe(CHAVE_RS);
    expect(result.cached).toBe(false);
    expect(result.emitente.cnpj).toBe('11222333000181');
    expect(result.totalCents).toBe(4770);
    expect(result.lines).toHaveLength(1);
    expect(result.itens).toHaveLength(1);
  });

  it('QR que não é de nota (produto) → recusa sem chamar o servidor', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookupNfce(QR_PRODUTO)).rejects.toThrow('nfce_invalid_qr');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('erro tipado do servidor (ex. portal fora) vira NfceImportError com código traduzível', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'nfce_portal_error' }, false, 504),
    );
    vi.stubGlobal('fetch', fetchMock);

    const err = await lookupNfce(QR_SEFAZ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NfceImportError);
    expect((err as NfceImportError).code).toBe('nfce_portal_error');
  });

  it('quota Free estourada → NfceImportError(nfce_quota_free) — caller abre paywall', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'nfce_quota_free' }, false, 403),
    );
    vi.stubGlobal('fetch', fetchMock);

    const err = await lookupNfce(QR_SEFAZ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NfceImportError);
    expect((err as NfceImportError).code).toBe('nfce_quota_free');
  });
});

describe('confirmNfce — best-effort (não lança se o servidor falhar)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sucesso: chama POST /nfce/confirm', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(confirmNfce(CHAVE_RS)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rede falha (offline) → não lança (dados locais já são a fonte da verdade)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(confirmNfce(CHAVE_RS)).resolves.toBeUndefined();
  });
});
