import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateNlList, NlListError } from './nl-list.js';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('generateNlList — NL-02/NL-04', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sucesso: devolve items + lines (mapeados 1:1 pelo servidor)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            descricao: 'Carvão',
            quantidade: 2,
            unidade: 'kg',
            valorUnitCents: 0,
            valorTotalCents: 0,
            ean: null,
          },
        ],
        lines: [
          { lineIndex: 0, itemId: null, confidence: 0, method: null, suggestedName: 'Carvão' },
        ],
        prompt: 'churrasco pra 10 pessoas',
        listId: undefined,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateNlList('churrasco pra 10 pessoas');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.descricao).toBe('Carvão');
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.suggestedName).toBe('Carvão');
  });

  it('array vazio → items/lines vazios (não é erro — UI avisa)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], lines: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateNlList('sei lá');

    expect(result.items).toEqual([]);
    expect(result.lines).toEqual([]);
  });

  it('403 pro_required → NlListError tratado à parte pelo caller (paywall)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'pro_required' }, false, 403));
    vi.stubGlobal('fetch', fetchMock);

    const err = await generateNlList('churrasco pra 10').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NlListError);
    expect((err as NlListError).code).toBe('pro_required');
  });

  it('502 ai_generation_failed → NlListError com código traduzível', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'ai_generation_failed' }, false, 502),
    );
    vi.stubGlobal('fetch', fetchMock);

    const err = await generateNlList('churrasco pra 10').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NlListError);
    expect((err as NlListError).code).toBe('ai_generation_failed');
  });

  it('501 ai_unavailable (sem chave) → NlListError com código traduzível', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'ai_unavailable' }, false, 501));
    vi.stubGlobal('fetch', fetchMock);

    const err = await generateNlList('churrasco pra 10').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NlListError);
    expect((err as NlListError).code).toBe('ai_unavailable');
  });

  it('listId opcional é enviado quando informado (destino = lista existente)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], lines: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await generateNlList('mais itens', 'lista-existente-id');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as { prompt: string; listId?: string };
    expect(sentBody.listId).toBe('lista-existente-id');
  });
});
