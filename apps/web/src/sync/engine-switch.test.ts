import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/dexie.js';
import { initHousehold, startSync } from './engine.js';

// syncNow é fire-and-forget dentro do initHousehold — deixa o loop assíncrono terminar.
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

/**
 * Regressão: trocar de casa com o sync JÁ iniciado tem que re-puxar os dados na hora.
 * O bug era `startSync` (idempotente, no-op quando já iniciado) ser o único gatilho pós-troca,
 * deixando a tela vazia até o próximo tick de 30s. O pull imediato vive no `initHousehold`.
 */
describe('troca de casa dispara pull imediato', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', { addEventListener: () => {} });
    vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
    vi.stubGlobal(
      'EventSource',
      class {
        close(): void {}
        addEventListener(): void {}
      },
    );
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ changes: {}, cursor: 0 }),
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('trocar de casa com sync iniciado re-puxa na hora (não espera o tick de 30s)', async () => {
    startSync(); // started = true (faz o pull inicial)
    await flush();

    await initHousehold('casa-a'); // primeiro load: casa não mudou → não puxa
    await flush();

    fetchMock.mockClear();

    await initHousehold('casa-b'); // troca real: changed && started → syncNow imediato
    await flush();

    const puxou = fetchMock.mock.calls.some(([url]) => String(url).includes('/sync/pull'));
    expect(puxou).toBe(true);
  });
});
