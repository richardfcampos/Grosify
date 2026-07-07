import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initHousehold } from '../sync/engine.js';
import { db } from './dexie.js';
import { confirmNlReview, type NlConfirmLine } from './nl-confirm.js';

// Molde de nfce-confirm.test.ts: fetch mockado (outbox dispara syncNow
// fire-and-forget), household inicializado, flush pra deixar o loop
// assíncrono assentar antes de inspecionar o Dexie.
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

function line(overrides: Partial<NlConfirmLine> = {}): NlConfirmLine {
  return {
    itemId: null,
    newItemName: 'Carvão',
    unit: 'kg',
    qty: 2,
    ...overrides,
  };
}

describe('confirmNlReview — NL-03', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    vi.stubGlobal('navigator', { onLine: true });
    await initHousehold('casa-teste');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ changes: {}, cursor: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('target new → cria 1 lista + N entradas', async () => {
    await confirmNlReview({
      target: { kind: 'new', name: 'Churrasco' },
      lines: [
        line({ newItemName: 'Carvão', unit: 'kg', qty: 3 }),
        line({ newItemName: 'Linguiça', unit: 'kg', qty: 2 }),
      ],
    });
    await flush();

    const lists = await db.lists.toArray();
    expect(lists).toHaveLength(1);
    expect(lists[0]!.name).toBe('Churrasco');
    expect(lists[0]!.isRecurring).toBe(false);

    const entries = await db.listEntries.where('listId').equals(lists[0]!.id).toArray();
    expect(entries).toHaveLength(2);

    const items = await db.items.toArray();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.name).sort()).toEqual(['Carvão', 'Linguiça']);
  });

  it('target existing → adiciona N entradas à lista já aberta (sem criar lista nova)', async () => {
    const listId = await db.lists.add({
      id: 'lista-existente',
      householdId: 'casa-teste',
      ownerId: null,
      name: 'Mercado da semana',
      isRecurring: true,
      isPrivate: false,
      budgetCents: null,
      icon: null,
      color: null,
      recurrence: null,
      recurrenceDay: null,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      serverVersion: 0,
    });

    await confirmNlReview({
      target: { kind: 'existing', listId: listId as string },
      lines: [line({ newItemName: 'Arroz', unit: 'kg', qty: 5 })],
    });
    await flush();

    const lists = await db.lists.toArray();
    expect(lists).toHaveLength(1); // nenhuma lista nova criada

    const entries = await db.listEntries.where('listId').equals(listId as string).toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.qty).toBe(5);
  });

  it('item repetido (mesmo itemId) na lista alvo faz upsert de qty — não duplica entrada', async () => {
    const itemId = await db.items.add({
      id: 'item-arroz',
      householdId: 'casa-teste',
      name: 'Arroz',
      category: null,
      categoryId: null,
      notes: null,
      minStock: null,
      photoKey: null,
      unit: 'kg',
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      serverVersion: 0,
      photoBlob: null,
    });
    const listId = await db.lists.add({
      id: 'lista-existente',
      householdId: 'casa-teste',
      ownerId: null,
      name: 'Mercado da semana',
      isRecurring: true,
      isPrivate: false,
      budgetCents: null,
      icon: null,
      color: null,
      recurrence: null,
      recurrenceDay: null,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      serverVersion: 0,
    });
    await db.listEntries.add({
      id: 'entry-arroz',
      householdId: 'casa-teste',
      listId: listId as string,
      itemId: itemId as string,
      qty: 1,
      assignedTo: null,
      assignedToName: null,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      serverVersion: 0,
    });

    await confirmNlReview({
      target: { kind: 'existing', listId: listId as string },
      lines: [line({ itemId: itemId as string, qty: 4 })],
    });
    await flush();

    const entries = await db.listEntries.where('listId').equals(listId as string).toArray();
    expect(entries).toHaveLength(1); // upsert, não duplicou
    expect(entries[0]!.qty).toBe(4); // qty editada na revisão persiste
  });

  it('linha "criar" (itemId null) cria o item ANTES da entrada — entrada referencia o item novo', async () => {
    await confirmNlReview({
      target: { kind: 'new', name: 'Festa' },
      lines: [line({ itemId: null, newItemName: 'Refrigerante', unit: 'l', qty: 6 })],
    });
    await flush();

    const items = await db.items.toArray();
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Refrigerante');
    expect(items[0]!.unit).toBe('l');

    const entries = await db.listEntries.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.itemId).toBe(items[0]!.id); // referencia o item recém-criado
    expect(entries[0]!.qty).toBe(6);
  });

  it('linha ignorada não grava (caller já filtra antes de chamar)', async () => {
    // O caller (nl-review.tsx) filtra `lines.filter(l => !l.ignored)` antes de
    // chamar confirmNlReview — aqui garantimos que só o que foi passado é gravado.
    await confirmNlReview({ target: { kind: 'new', name: 'Lista vazia' }, lines: [] });
    await flush();

    const lists = await db.lists.toArray();
    expect(lists).toHaveLength(1); // a lista é criada mesmo sem linhas (avulsa)
    expect(await db.listEntries.count()).toBe(0);
    expect(await db.items.count()).toBe(0);
  });

  it('unidade fora do enum Unit vira "un" (default seguro) ao criar o item', async () => {
    await confirmNlReview({
      target: { kind: 'new', name: 'Lista' },
      lines: [line({ itemId: null, newItemName: 'Item Estranho', unit: 'xícara', qty: 1 })],
    });
    await flush();

    const items = await db.items.toArray();
    expect(items).toHaveLength(1);
    expect(items[0]!.unit).toBe('un');
  });
});
