import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupFor, NfceLookupError } from './index.js';
import { InfosimplesProvider } from './infosimples-provider.js';
import { logNfceLookup, maskChave } from './nfce-log.js';
import { fetchPortalHtml } from './parsers/portal-fetch.js';
import { parseSvrsHtml } from './parsers/svrs-html.js';
import { SvrsParser } from './parsers/svrs-parser.js';

const CHAVE_RS = '43250714200166000166650010000012341123456789';
const CHAVE_SE = '28250714200166000166650010000012341123456789';
const QR_RS = `https://www.sefazvirtual.rs.gov.br/qrcode?p=${CHAVE_RS}|3|1`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('erros tipados por caminho de falha', () => {
  it('UF sem parser nem adapter (BA) → uf_unsupported', () => {
    try {
      lookupFor('BA', {});
      expect.unreachable();
    } catch (err) {
      expect((err as NfceLookupError).code).toBe('uf_unsupported');
    }
  });

  it('Sergipe sem INFOSIMPLES_TOKEN → state_unsupported', () => {
    try {
      lookupFor('SE', {});
      expect.unreachable();
    } catch (err) {
      expect((err as NfceLookupError).code).toBe('state_unsupported');
    }
  });

  it('portal com HTTP≠200 → nfce_portal_error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('forbidden', { status: 403 }));
    await expect(fetchPortalHtml(QR_RS, 'RS')).rejects.toMatchObject({ code: 'nfce_portal_error' });
  });

  it('portal com timeout/rede → nfce_portal_error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('AbortError'));
    await expect(fetchPortalHtml(QR_RS, 'RS')).rejects.toMatchObject({ code: 'nfce_portal_error' });
  });

  it('HTML sem itens → nfce_parse_failed (não itens vazios)', () => {
    try {
      parseSvrsHtml('<html><body>página de erro do portal sem tabela de itens</body></html>', 'RS');
      expect.unreachable();
    } catch (err) {
      expect((err as NfceLookupError).code).toBe('nfce_parse_failed');
    }
  });

  it('adapter Infosimples com code!=200 → nfce_provider_error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 999 }), { status: 200 }),
    );
    await expect(
      new InfosimplesProvider('tok').fetchItems(CHAVE_SE, 'https://x'),
    ).rejects.toMatchObject({ code: 'nfce_provider_error' });
  });
});

describe('resiliência do portal — 1 retry com backoff', () => {
  it('erro transitório na 1ª tentativa, sucesso no retry → devolve o HTML (1 retry)', async () => {
    const okHtml = '<html><body>'.padEnd(200, ' ') + '</body></html>';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(new Response(okHtml, { status: 200 }));

    const html = await fetchPortalHtml(QR_RS, 'RS');
    expect(html).toContain('body');
    // Exatamente 2 chamadas: a que falhou + o único retry.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('erro nas duas tentativas → nfce_portal_error após esgotar o retry (2 chamadas)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('down', { status: 503 }));
    await expect(fetchPortalHtml(QR_RS, 'RS')).rejects.toMatchObject({ code: 'nfce_portal_error' });
    // Não faz retry infinito: só 1 retry (2 chamadas no total).
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('logging seguro (LGPD) — nunca CPF nem HTML cru', () => {
  it('maskChave expõe só os 8 últimos dígitos', () => {
    expect(maskChave(CHAVE_RS)).toBe('…23456789');
    expect(maskChave(undefined)).toBe('');
  });

  it('logNfceLookup de sucesso não contém a chave inteira nem HTML', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logged = logNfceLookup({
      uf: 'RS',
      family: 'svrs',
      status: 'parsed',
      itemCount: 3,
      chave: CHAVE_RS,
    });
    const serialized = JSON.stringify(logged);
    // Chave inteira não pode aparecer; só o sufixo mascarado.
    expect(serialized).not.toContain(CHAVE_RS);
    expect(serialized).toContain('…23456789');
    // O que foi passado ao console também não contém a chave inteira.
    expect(JSON.stringify(spy.mock.calls)).not.toContain(CHAVE_RS);
    spy.mockRestore();
  });

  it('o objeto logado carrega só campos seguros (sem chaves de CPF/HTML)', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const logged = logNfceLookup({ uf: 'SE', status: 'nfce_provider_error', chave: CHAVE_SE });
    const keys = Object.keys(logged);
    // Só o conjunto seguro — nenhum campo de CPF, HTML, rawJson, endereço.
    expect(keys.sort()).toEqual(['chave', 'status', 'uf']);
  });

  it('SvrsParser existe e implementa a porta (family svrs) — guard de fumaça', () => {
    // Garante que o parser real está no grafo (auto-registro) sem tocar em rede.
    expect(new SvrsParser().family).toBe('svrs');
  });
});
