import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NfceItem } from './types.js';
import { cosine, EMBEDDING_DIM } from './embedding.js';
import { matchItems, matchLine, tokenSetScore, type CatalogItem } from './matching.js';

/** Helper: monta um NfceItem só com a descrição (o resto não afeta o matching). */
function line(descricao: string): NfceItem {
  return { descricao, quantidade: 1, unidade: 'UN', valorUnitCents: 100, valorTotalCents: 100, ean: null };
}

const CATALOG: CatalogItem[] = [
  { id: 'arroz', name: 'Arroz' },
  { id: 'feijao', name: 'Feijão' },
  { id: 'leite', name: 'Leite' },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('matchLine — fuzzy determinístico (NFCE-03 AC1)', () => {
  it('"ARROZ TP1 5KG CAMIL" casa "Arroz" só por token (sem embedding)', () => {
    const hit = matchLine('ARROZ TP1 5KG CAMIL', CATALOG);
    expect(hit).not.toBeNull();
    expect(hit!.itemId).toBe('arroz');
    expect(hit!.method).toBe('fuzzy');
    expect(hit!.confidence).toBeGreaterThan(0.7);
  });

  it('casa exato quando a descrição normalizada bate o nome do item', () => {
    const hit = matchLine('FEIJAO', CATALOG);
    expect(hit).not.toBeNull();
    expect(hit!.itemId).toBe('feijao');
    expect(hit!.method).toBe('exact');
    expect(hit!.confidence).toBe(1);
  });

  it('descrição sem nenhum token do catálogo → null (vira "novo")', () => {
    expect(matchLine('SABAO EM PO OMO 1KG', CATALOG)).toBeNull();
  });

  it('catálogo vazio → null (NFCE-03 AC5: tudo "novo")', () => {
    expect(matchLine('ARROZ 5KG', [])).toBeNull();
  });

  it('não auto-casa em empate na faixa alta (nunca casa errado — edge case)', () => {
    const ambiguous: CatalogItem[] = [
      { id: 'coca', name: 'Refrigerante Coca' },
      { id: 'guarana', name: 'Refrigerante Guarana' },
    ];
    // "REFRIGERANTE" bate os dois igualmente → ambíguo, não casa por fuzzy.
    expect(matchLine('REFRIGERANTE 2L', ambiguous)).toBeNull();
  });
});

describe('tokenSetScore', () => {
  it('cobertura total do nome do item na nota dá score alto', () => {
    expect(tokenSetScore('ARROZ CAMIL', 'ARROZ')).toBeGreaterThan(0.7);
  });
  it('nenhum token em comum → 0', () => {
    expect(tokenSetScore('ARROZ', 'DETERGENTE')).toBe(0);
  });
});

describe('cosine — vetores conhecidos', () => {
  it('vetores idênticos → 1', () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });
  it('ortogonais → 0', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it('mesma direção, magnitudes diferentes → 1', () => {
    expect(cosine([2, 4], [1, 2])).toBeCloseTo(1, 6);
  });
  it('dimensões divergentes → 0 (não lança)', () => {
    expect(cosine([1, 2, 3], [1, 2])).toBe(0);
  });
  it('vetor nulo → 0 (não divide por zero)', () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe('matchItems — sem GEMINI_API_KEY (NFCE-03 AC3: degrada, não lança)', () => {
  it('não chama fetch e resolve por fuzzy', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const results = await matchItems([line('ARROZ TP1 5KG CAMIL'), line('LEITE INTEGRAL 1L')], CATALOG, {});
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(results[0]!.itemId).toBe('arroz');
    expect(results[1]!.itemId).toBe('leite');
    expect(results.every((r) => r.method !== 'embedding')).toBe(true);
  });

  it('catálogo vazio → todas as linhas "novo" com nome pré-preenchido (AC5)', async () => {
    const results = await matchItems([line('ARROZ 5KG'), line('CERVEJA LATA')], [], {});
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.itemId === null && r.method === null)).toBe(true);
    expect(results[0]!.suggestedName).toBe('ARROZ 5KG');
  });
});

describe('matchItems — embedding desempata ambíguo (NFCE-03 AC2/AC6)', () => {
  // Catálogo com sinônimo opaco: "MASSA" não tem token em comum com "MACARRAO",
  // então o fuzzy não resolve — cai no embedding (mockado).
  const withEmbedding: CatalogItem[] = [
    { id: 'massa', name: 'Massa Espaguete', embedding: [1, 0, 0] },
    { id: 'molho', name: 'Molho de Tomate', embedding: [0, 1, 0] },
  ];

  it('usa cosine do embedding cacheado quando o fuzzy não resolve', async () => {
    // "MACARRAO ESPAGUETE" compartilha "ESPAGUETE" com "Massa Espaguete" (faixa
    // ambígua). O embed mockado retorna vetor próximo de "massa".
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [{ values: [0.9, 0.1, 0] }] }),
    }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const results = await matchItems([line('MACARRAO ESPAGUETE 500G')], withEmbedding, {
      GEMINI_API_KEY: 'test-key',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(results[0]!.itemId).toBe('massa');
    expect(results[0]!.method).toBe('embedding');
  });

  it('embed falhando (fetch !ok) → degrada pra "novo", não lança', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch);
    const results = await matchItems([line('MACARRAO ESPAGUETE 500G')], withEmbedding, {
      GEMINI_API_KEY: 'test-key',
    });
    expect(results[0]!.itemId).toBeNull();
  });

  it('linha já resolvida por fuzzy não gera chamada de embedding', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    // "ARROZ" resolve por fuzzy exato → nenhuma linha pendente → sem fetch.
    const results = await matchItems([line('ARROZ')], [{ id: 'arroz', name: 'Arroz', embedding: [1, 0] }], {
      GEMINI_API_KEY: 'test-key',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(results[0]!.itemId).toBe('arroz');
    expect(results[0]!.method).toBe('exact');
  });
});

describe('embedding dimension constant', () => {
  it('trunca a 768d (MRL)', () => {
    expect(EMBEDDING_DIM).toBe(768);
  });
});
