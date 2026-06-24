import { beforeEach, describe, expect, it } from 'vitest';
import { db, type LocalItem } from '../../db/dexie.js';
import { initHousehold } from '../../sync/engine.js';
import { seedCommonItems } from './seed-items.js';

function fakeItem(id: string): LocalItem {
  return {
    id,
    householdId: 'h-test',
    name: `Item ${id}`,
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
  };
}

describe('seedCommonItems', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('semeia o catálogo comum quando a casa está vazia', async () => {
    await initHousehold('h-test'); // createItem usa a casa atual (hid())
    await seedCommonItems();
    expect(await db.items.count()).toBe(20);
  });

  it('NÃO duplica quando a casa já tem itens (regressão do onboarding server-side)', async () => {
    await db.items.add(fakeItem('existente-1'));
    await seedCommonItems(); // guarda: já tem item → no-op, não chama createItem
    expect(await db.items.count()).toBe(1);
  });
});
