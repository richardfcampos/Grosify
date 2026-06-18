import { db } from '../db/dexie.js';

function downloadBlob(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Exporta o histórico de preços em CSV (item, marca, loja, preço, data, avaliação). */
export async function exportPricesCsv(): Promise<void> {
  const [prices, items, brands, stores] = await Promise.all([
    db.prices.filter((p) => p.deletedAt === null).toArray(),
    db.items.toArray(),
    db.brands.toArray(),
    db.stores.toArray(),
  ]);
  const iName = new Map(items.map((i) => [i.id, i.name]));
  const bName = new Map(brands.map((b) => [b.id, b.name]));
  const sName = new Map(stores.map((s) => [s.id, s.name]));
  const header = ['item', 'marca', 'loja', 'preco_centavos', 'data', 'avaliacao'];
  const rows = [...prices]
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .map((p) => [
      iName.get(p.itemId) ?? '',
      p.brandId ? bName.get(p.brandId) ?? '' : '',
      sName.get(p.storeId) ?? '',
      p.priceCents,
      p.recordedAt,
      p.rating ?? '',
    ]);
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
  downloadBlob('﻿' + csv, 'grosify-precos.csv', 'text/csv;charset=utf-8');
}

/** Mapa tabela-do-backup → tabela Dexie. */
const TABLE_MAP = {
  categories: db.categories,
  items: db.items,
  item_brands: db.brands,
  item_comments: db.comments,
  item_barcodes: db.barcodes,
  stores: db.stores,
  price_records: db.prices,
  shopping_lists: db.lists,
  shopping_list_entries: db.listEntries,
  inventory_counts: db.inventory,
  stock_movements: db.movements,
  shopping_sessions: db.sessions,
  shopping_session_items: db.sessionItems,
} as const;

// campos numeric(10,3) chegam como string no JSON → converter pra number
const NUM_FIELDS = ['qty', 'qtyOnHand', 'neededQty', 'actualQty', 'balanceAfter', 'minStock'];

/**
 * Restaura um backup JSON no cache local (merge por id). Não reenvia ao servidor;
 * serve pra repovoar o dispositivo a partir de um arquivo exportado.
 */
export async function importBackup(json: unknown): Promise<number> {
  const data = (json as { data?: Record<string, unknown[]> })?.data;
  if (!data || typeof data !== 'object') throw new Error('invalid_backup');
  let count = 0;
  for (const [key, table] of Object.entries(TABLE_MAP)) {
    const rows = data[key];
    if (!Array.isArray(rows)) continue;
    const cleaned = rows.map((r) => {
      const o = { ...(r as Record<string, unknown>) };
      for (const f of NUM_FIELDS) if (o[f] != null) o[f] = Number(o[f]);
      return o;
    });
    await (table as { bulkPut: (rows: never[]) => Promise<unknown> }).bulkPut(cleaned as never[]);
    count += cleaned.length;
  }
  return count;
}
