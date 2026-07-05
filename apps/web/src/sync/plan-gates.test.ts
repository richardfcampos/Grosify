import { FREE_MAX_ITEMS } from '@grosify/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/dexie.js';
import { createItem } from '../db/repositories.js';
import { initHousehold, rejectedByPlanCount, setCachedPlan } from './engine.js';

// enqueue dispara syncNow fire-and-forget — deixa o loop assíncrono terminar antes
// de inspecionar o estado (mesmo padrão de engine-switch.test.ts).
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

/**
 * BILL-01 AC1 (offline): preflight local bloqueia a criação antes do otimista quando
 * o plano cacheado é free e o teto já foi atingido; plano pro/desconhecido segue
 * (fail-open — servidor é a fonte autoritativa). Reconciliação: 403 de limite no
 * drain desfaz a linha otimista + conta em rejectedByPlan; 403 genérico não desfaz.
 */
describe('plan gates — preflight offline + reconciliação', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    vi.stubGlobal('navigator', { onLine: true });
    await initHousehold('casa-teste');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedItems(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await db.items.put({
        id: `item-${i}`,
        householdId: 'casa-teste',
        name: `Item ${i}`,
        category: null,
        categoryId: null,
        notes: null,
        minStock: null,
        photoKey: null,
        unit: 'un',
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        serverVersion: 0,
        photoBlob: null,
      });
    }
  }

  it('bloqueia o 31º item quando o plano cacheado é free (teto batido)', async () => {
    await seedItems(FREE_MAX_ITEMS);
    await setCachedPlan('free');

    await expect(
      createItem({ name: 'Item extra', unit: 'un', barcodes: [] }),
    ).rejects.toThrow('item_limit_reached');

    // nada foi otimisticamente escrito nem enfileirado
    const total = await db.items.where('householdId').equals('casa-teste').count();
    expect(total).toBe(FREE_MAX_ITEMS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deixa passar no teto quando o plano cacheado é pro', async () => {
    await seedItems(FREE_MAX_ITEMS);
    await setCachedPlan('pro');
    // resposta genérica cobre tanto o POST de criação quanto o pull subsequente do
    // mesmo ciclo de sync (drainOutbox → pull) — shape válido para os dois.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ changes: {}, cursor: 0 }),
    });

    await expect(
      createItem({ name: 'Item extra', unit: 'un', barcodes: [] }),
    ).resolves.toEqual(expect.any(String));
    await flush();

    const total = await db.items.where('householdId').equals('casa-teste').count();
    expect(total).toBe(FREE_MAX_ITEMS + 1);
  });

  it('plano desconhecido (sem cache) no teto NÃO bloqueia — fail-open, servidor decide', async () => {
    await seedItems(FREE_MAX_ITEMS);
    // sem setCachedPlan: db.meta não tem a chave 'plan' (page-load offline, cache limpo)
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ changes: {}, cursor: 0 }),
    });

    await expect(
      createItem({ name: 'Item extra', unit: 'un', barcodes: [] }),
    ).resolves.toEqual(expect.any(String));
    await flush();

    const total = await db.items.where('householdId').equals('casa-teste').count();
    expect(total).toBe(FREE_MAX_ITEMS + 1);
  });

  it('403 item_limit_reached no drain remove o item otimista e incrementa rejectedByPlan', async () => {
    // plano desconhecido (fail-open): preflight deixa passar, servidor rejeita no sync
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'item_limit_reached' }),
    });

    const id = await createItem({ name: 'Item rejeitado', unit: 'un', barcodes: [] });
    await flush();

    const stillThere = await db.items.get(id);
    expect(stillThere).toBeUndefined();
    expect(await rejectedByPlanCount()).toBe(1);
  });

  it('403 genérico (ex. validação) NÃO remove a linha otimista', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'validation_error' }),
    });

    const id = await createItem({ name: 'Item com erro de validação', unit: 'un', barcodes: [] });
    await flush();

    const stillThere = await db.items.get(id);
    expect(stillThere).toBeDefined();
    expect(await rejectedByPlanCount()).toBe(0);
  });
});
