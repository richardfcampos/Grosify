import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateShoppingList, type GeneratedLine } from './gemini-generate.js';

/**
 * Testes do cliente de geração (NL-01): fetch do Gemini mockado. Deriva dos ACs:
 * JSON válido → lines; sem chave → null; JSON quebrado → null; timeout → null;
 * array vazio → []; qty absurda → clamp 1; linha sem name → descartada.
 */

const KEY_ENV = { GEMINI_API_KEY: 'test-key' };

/** Mocka o fetch pra devolver o `candidates[0].content.parts[0].text` (JSON string). */
function stubGenerate(textJson: string, ok = true): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn(async () => ({
    ok,
    json: async () => ({ candidates: [{ content: { parts: [{ text: textJson }] } }] }),
  }));
  vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
  return fetchSpy;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('generateShoppingList — sucesso (NL-01 AC1)', () => {
  it('JSON válido → GeneratedLine[] alinhado', async () => {
    stubGenerate(
      JSON.stringify([
        { name: 'Arroz', qty: 2, unit: 'kg' },
        { name: 'Cerveja', qty: 12, unit: 'un' },
      ]),
    );
    const lines = await generateShoppingList('churrasco pra 10', KEY_ENV);
    expect(lines).toEqual<GeneratedLine[]>([
      { name: 'Arroz', qty: 2, unit: 'kg' },
      { name: 'Cerveja', qty: 12, unit: 'un' },
    ]);
  });

  it('array vazio (modelo não entendeu itens) → [] (não é erro)', async () => {
    stubGenerate('[]');
    const lines = await generateShoppingList('asdkjhaskjd', KEY_ENV);
    expect(lines).toEqual([]);
  });
});

describe('generateShoppingList — env-gate e falhas → null', () => {
  it('sem GEMINI_API_KEY → null, sem chamar fetch (caller vira 501)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const lines = await generateShoppingList('churrasco', {});
    expect(lines).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('JSON malformado no texto → null (caller retry → 502)', async () => {
    stubGenerate('{ nao eh json valido');
    expect(await generateShoppingList('churrasco', KEY_ENV)).toBeNull();
  });

  it('resposta não-array → null', async () => {
    stubGenerate(JSON.stringify({ name: 'Arroz' }));
    expect(await generateShoppingList('churrasco', KEY_ENV)).toBeNull();
  });

  it('HTTP≠200 → null', async () => {
    stubGenerate('[]', false);
    expect(await generateShoppingList('churrasco', KEY_ENV)).toBeNull();
  });

  it('timeout/rede (fetch lança) → null, sem propagar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('timeout');
      }) as unknown as typeof fetch,
    );
    expect(await generateShoppingList('churrasco', KEY_ENV)).toBeNull();
  });
});

describe('generateShoppingList — validação zod (descarta lixo, clampa qty)', () => {
  it('linha sem name → descartada, mantém as válidas', async () => {
    stubGenerate(
      JSON.stringify([
        { qty: 1, unit: 'un' }, // sem name → fora
        { name: 'Pão', qty: 1, unit: 'un' },
        { name: '   ', qty: 1, unit: 'un' }, // vazio após trim → fora
      ]),
    );
    const lines = await generateShoppingList('café da manhã', KEY_ENV);
    expect(lines).toEqual([{ name: 'Pão', qty: 1, unit: 'un' }]);
  });

  it('qty <=0 / >999 / ausente → clamp pra 1 (edge case do spec)', async () => {
    stubGenerate(
      JSON.stringify([
        { name: 'A', qty: 0, unit: 'un' },
        { name: 'B', qty: -5, unit: 'un' },
        { name: 'C', qty: 9999, unit: 'un' },
        { name: 'D', unit: 'un' }, // qty ausente
      ]),
    );
    const lines = await generateShoppingList('lista', KEY_ENV);
    expect(lines!.map((l) => l.qty)).toEqual([1, 1, 1, 1]);
  });

  it('qty válida no limite (999) é preservada', async () => {
    stubGenerate(JSON.stringify([{ name: 'A', qty: 999, unit: 'un' }]));
    const lines = await generateShoppingList('lista', KEY_ENV);
    expect(lines![0]!.qty).toBe(999);
  });
});
