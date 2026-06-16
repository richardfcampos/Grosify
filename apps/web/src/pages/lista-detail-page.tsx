import { cheapestStore, estimateTotal, type PriceRecord } from '@grosify/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../db/dexie.js';
import {
  createItem,
  deleteList,
  removeListEntry,
  setListEntry,
  startShoppingSession,
} from '../db/repositories.js';
import { PrecoSheet } from '../features/prices/preco-sheet.js';
import { useFormatMoney } from '../lib/use-currency.js';

/** Preço unitário estimado (loja mais barata) de um item, ou null. */
function unitPrice(prices: PriceRecord[], itemId: string): number | null {
  const cheapest = cheapestStore(prices.filter((p) => p.itemId === itemId));
  return cheapest?.priceCents ?? null;
}

export function ListaDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormatMoney();
  const { id } = useParams({ from: '/app/listas/$id' });

  const list = useLiveQuery(() => db.lists.get(id), [id]);
  const entries = useLiveQuery(
    () => db.listEntries.where('listId').equals(id).filter((e) => e.deletedAt === null).toArray(),
    [id],
    [],
  );
  const items = useLiveQuery(
    () => db.items.filter((i) => i.deletedAt === null).toArray(),
    [],
    [] as LocalItem[],
  );
  const prices = useLiveQuery(
    () => db.prices.filter((p) => p.deletedAt === null).toArray(),
    [],
    [] as PriceRecord[],
  );

  const [priceItem, setPriceItem] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const estimate = useMemo(
    () =>
      estimateTotal(
        entries.map((e) => ({ qty: e.qty, unitPriceCents: unitPrice(prices, e.itemId) })),
      ),
    [entries, prices],
  );

  const available = items.filter((i) => !entries.some((e) => e.itemId === i.id));

  if (!list) return null;

  return (
    <main className="flex flex-col gap-4 px-5 py-6">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate({ to: '/listas' })} className="text-sm text-zinc-500">
          ← {t('common.back')}
        </button>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              list.isRecurring ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
            }`}
          >
            {list.isRecurring ? t('lists.recurringTag') : t('lists.oneTimeTag')}
          </span>
          <button
            onClick={async () => {
              if (!confirm(t('lists.deleteListConfirm', { name: list.name }))) return;
              await deleteList(id);
              navigate({ to: '/listas' });
            }}
            aria-label={t('lists.deleteList')}
            className="p-1 text-base text-zinc-300 active:text-red-600"
          >
            🗑
          </button>
        </div>
      </header>

      <h1 className="text-2xl font-bold text-zinc-900">{list.name}</h1>

      <div className="rounded-2xl bg-zinc-900 px-5 py-4 text-white">
        <p className="text-xs uppercase tracking-wide text-zinc-400">{t('lists.estimatedTotal')}</p>
        <p className="text-3xl font-bold">{fmt(estimate.totalCents)}</p>
        {estimate.missingPriceLines > 0 && (
          <p className="mt-1 text-xs text-zinc-400">
            {t('lists.missingPrices', { count: estimate.missingPriceLines })}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        {list.isRecurring && (
          <Link
            to="/inventario"
            className="flex-1 rounded-xl border border-green-600 px-4 py-2.5 text-center text-sm font-semibold text-green-700"
          >
            {t('lists.inventory')}
          </Link>
        )}
        {entries.length > 0 && (
          <button
            onClick={async () => {
              const sid = await startShoppingSession(id);
              navigate({ to: '/compra/$id', params: { id: sid } });
            }}
            className="flex-1 rounded-xl bg-green-600 px-4 py-2.5 text-center text-sm font-bold text-white active:bg-green-700"
          >
            {t('shopping.start')}
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-center text-zinc-500">{t('lists.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => {
            const item = itemById.get(entry.itemId);
            if (!item) return null;
            const price = unitPrice(prices, entry.itemId);
            return (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-900">{item.name}</p>
                  <button
                    onClick={() => setPriceItem({ id: item.id, name: item.name })}
                    className="text-sm text-green-700"
                  >
                    {price !== null ? fmt(price) : t('prices.record')}
                  </button>
                </div>
                <QtyInput
                  value={entry.qty}
                  unit={t(`catalog.units.${item.unit}`)}
                  label={list.isRecurring ? t('lists.recommended') : t('lists.qty')}
                  onCommit={(qty) => setListEntry(id, entry.itemId, qty)}
                />
                <button
                  onClick={() => {
                    if (confirm(t('lists.removeConfirm', { name: item.name })))
                      removeListEntry(entry.id);
                  }}
                  className="ml-1 px-1 text-zinc-300"
                  aria-label={t('lists.remove')}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        onClick={() => setAdding(true)}
        className="min-h-12 rounded-xl border border-green-600 px-4 py-3 text-sm font-semibold text-green-700"
      >
        {t('lists.addItem')}
      </button>

      {priceItem && (
        <PrecoSheet itemId={priceItem.id} itemName={priceItem.name} onClose={() => setPriceItem(null)} />
      )}
      {adding && (
        <AddItemSheet
          items={available}
          onPick={(itemId) => {
            setListEntry(id, itemId, 1);
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </main>
  );
}

function QtyInput({
  value,
  unit,
  label,
  onCommit,
}: {
  value: number;
  unit: string;
  label: string;
  onCommit: (qty: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  // mantém o input em sincronia quando o valor muda por fora (sync de outro device)
  useEffect(() => setLocal(String(value)), [value]);

  function commit() {
    const n = Number(local.replace(',', '.'));
    if (n > 0 && n !== value) onCommit(n);
    else setLocal(String(value));
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-zinc-400">{label}</span>
      <div className="flex items-center gap-1">
        <input
          value={local}
          onChange={(e) => setLocal(e.target.value.replace(/[^\d.,]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            // Enter apenas confirma (blur) — nunca dispara outra ação na página
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          inputMode="decimal"
          className="w-16 rounded-lg border border-zinc-300 px-2 py-1.5 text-center text-base"
        />
        <span className="w-7 text-xs text-zinc-400">{unit}</span>
      </div>
    </div>
  );
}

function AddItemSheet({
  items,
  onPick,
  onClose,
}: {
  items: LocalItem[];
  onPick: (itemId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = [...items]
    .filter((i) => i.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const exactExists = items.some((i) => i.name.trim().toLowerCase() === q);

  async function onCreate() {
    if (!query.trim() || creating) return;
    setCreating(true);
    const id = await createItem({ name: query.trim(), unit: 'un', barcodes: [] });
    onPick(id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[80dvh] w-full max-w-md flex-col gap-2 rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <h2 className="text-lg font-bold text-zinc-900">{t('lists.selectItem')}</h2>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('catalog.searchItems')}
          className="min-h-12 rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
        />

        <div className="flex flex-col gap-1 overflow-y-auto">
          {query.trim() && !exactExists && (
            <button
              onClick={onCreate}
              disabled={creating}
              className="rounded-xl bg-green-50 px-4 py-3 text-left text-base font-medium text-green-700 active:bg-green-100 disabled:opacity-50"
            >
              + {t('lists.createItem', { name: query.trim() })}
            </button>
          )}
          {filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => onPick(item.id)}
              className="rounded-xl px-4 py-3 text-left text-base active:bg-zinc-100"
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
