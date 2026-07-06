import { cheapestStore, estimateTotal, type PriceRecord } from '@grosify/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../db/dexie.js';
import {
  assignListEntry,
  createItem,
  deleteList,
  removeListEntry,
  setListEntry,
} from '../db/repositories.js';
import { NlReview } from '../features/nl-list/nl-review.js';
import { PrecoSheet } from '../features/prices/preco-sheet.js';
import { Badge, Button, Empty, Icon, MoneyValue, useMoneyParts } from '../features/ui/index.js';
import { useConfirm } from '../lib/confirm.js';
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
  const money = useMoneyParts();
  const confirm = useConfirm();
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
  const [addingByText, setAddingByText] = useState(false);
  // membros da casa (online) para atribuir responsável
  const [members, setMembers] = useState<{ userId: string; name: string }[]>([]);
  useEffect(() => {
    const url = import.meta.env.VITE_API_URL ?? 'http://localhost:3010';
    fetch(`${url}/households/members`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d: { members: { userId: string; name: string }[] }) => setMembers(d.members))
      .catch(() => {});
  }, []);

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
    <main className="screen-in flex flex-col gap-4 px-[18px] py-6">
      <header className="flex items-center justify-between">
        <button
          onClick={() => navigate({ to: '/listas' })}
          className="muted flex items-center gap-1 text-sm font-semibold"
        >
          <Icon name="back" size={17} /> {t('common.back')}
        </button>
        <button
          onClick={async () => {
            const ok = await confirm({
              title: t('lists.deleteList'),
              message: t('lists.deleteListConfirm', { name: list.name }),
              confirmLabel: t('common.delete'),
              danger: true,
            });
            if (!ok) return;
            await deleteList(id);
            navigate({ to: '/listas' });
          }}
          aria-label={t('lists.deleteList')}
          className="p-1 text-base text-[var(--app-gray)] active:text-[var(--gro-red)]"
        >
          🗑
        </button>
      </header>

      <div className="flex items-center gap-3">
        {list.icon && <span className="text-3xl">{list.icon}</span>}
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{list.name}</h1>
          <div className="mt-1.5 flex gap-1.5">
            <Badge tone="neutral">
              {list.isRecurring ? t('lists.recurringTag') : t('lists.oneTimeTag')}
            </Badge>
            {list.budgetCents != null && list.budgetCents > 0 && (
              <Badge tone="neutral">
                {t('lists.budget')} {fmt(list.budgetCents)}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="card flex items-center justify-between p-[18px]">
        <div>
          <div className="kicker mb-1.5">{t('lists.estimatedTotal')}</div>
          <MoneyValue cents={estimate.totalCents} size="md" {...money} />
        </div>
        {estimate.missingPriceLines > 0 && (
          <span className="muted mono text-xs">
            {t('lists.missingPrices', { count: estimate.missingPriceLines })}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        {list.isRecurring && (
          <Link
            to="/inventario"
            className="gro-btn gro-btn--secondary gro-btn--md flex-1"
          >
            {t('lists.inventory')}
          </Link>
        )}
        {entries.length > 0 && (
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            onClick={() => navigate({ to: '/listas/$id/comprar', params: { id } })}
          >
            <Icon name="cart" size={20} /> {t('shopping.start')}
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <Empty
            icon="list"
            title={t('lists.empty')}
            action={
              <Button variant="primary" size="md" onClick={() => setAdding(true)}>
                <Icon name="plus" size={18} /> {t('lists.addItem')}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
          {entries.map((entry) => {
            const item = itemById.get(entry.itemId);
            if (!item) return null;
            const price = unitPrice(prices, entry.itemId);
            return (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <Icon name="box" size={16} className="flex-none text-[var(--app-gray)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.name}</p>
                  <button
                    onClick={() => setPriceItem({ id: item.id, name: item.name })}
                    className="mono text-sm text-[var(--gro-green)]"
                  >
                    {price !== null ? fmt(price) : t('prices.record')}
                  </button>
                  {members.length > 1 && (
                    <select
                      value={entry.assignedTo ?? ''}
                      onChange={(e) => {
                        const m = members.find((x) => x.userId === e.target.value);
                        assignListEntry(id, entry.itemId, m?.userId ?? null, m?.name ?? null);
                      }}
                      className="muted mt-1 block w-full rounded-lg border border-[var(--app-border)] bg-transparent px-2 py-1 text-xs"
                    >
                      <option value="">{t('lists.unassigned')}</option>
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <QtyInput
                  value={entry.qty}
                  unit={t(`catalog.units.${item.unit}`)}
                  label={list.isRecurring ? t('lists.recommended') : t('lists.qty')}
                  onCommit={(qty) => setListEntry(id, entry.itemId, qty)}
                />
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      message: t('lists.removeConfirm', { name: item.name }),
                      confirmLabel: t('common.delete'),
                      danger: true,
                    });
                    if (ok) removeListEntry(entry.id);
                  }}
                  className="ml-1 px-1 text-[var(--app-gray)]"
                  aria-label={t('lists.remove')}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {entries.length > 0 && (
        <div className="flex gap-2">
          <Button variant="ghost" size="md" className="flex-1" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> {t('lists.addItem')}
          </Button>
          <Button variant="ghost" size="md" className="flex-1" onClick={() => setAddingByText(true)}>
            <Icon name="plus" size={18} /> {t('nlList.addByText')}
          </Button>
        </div>
      )}

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
      {addingByText && (
        <AddByTextSheet listId={id} onClose={() => setAddingByText(false)} />
      )}
    </main>
  );
}

/** Sheet pequeno: textarea de prompt → revisão nl-list na lista já aberta. */
function AddByTextSheet({ listId, onClose }: { listId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [reviewing, setReviewing] = useState(false);

  if (reviewing) {
    return <NlReview prompt={prompt.trim()} target={{ kind: 'existing', listId }} onClose={onClose} />;
  }

  return (
    <div className="gro-sheet-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="gro-sheet-panel flex flex-col gap-3">
        <div className="gro-sheet-grip" />
        <h2 className="text-lg font-bold">{t('nlList.addByText')}</h2>
        <textarea
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder={t('nlList.textFieldPlaceholder')}
          className="gro-field"
        />
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!prompt.trim()}
          onClick={() => setReviewing(true)}
        >
          {t('nlList.confirm')}
        </Button>
      </div>
    </div>
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
      <span className="text-[10px] uppercase tracking-wide text-[var(--app-gray)]">{label}</span>
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
          className="gro-field gro-field--mono text-center"
          style={{ padding: '6px 8px', width: '3.5rem' }}
        />
        <span className="w-7 text-xs text-[var(--app-gray)]">{unit}</span>
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
    <div className="gro-sheet-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="gro-sheet-panel flex flex-col gap-2">
        <div className="gro-sheet-grip" />
        <h2 className="text-lg font-bold">{t('lists.selectItem')}</h2>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('catalog.searchItems')}
          className="gro-field"
        />

        <div className="flex flex-col gap-1 overflow-y-auto">
          {query.trim() && !exactExists && (
            <button
              onClick={onCreate}
              disabled={creating}
              className="rounded-xl px-4 py-3 text-left text-base font-medium disabled:opacity-50"
              style={{ background: 'color-mix(in srgb, var(--gro-green) 12%, transparent)', color: 'var(--gro-green)' }}
            >
              + {t('lists.createItem', { name: query.trim() })}
            </button>
          )}
          {filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => onPick(item.id)}
              className="tap rounded-xl px-4 py-3 text-left text-base"
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
