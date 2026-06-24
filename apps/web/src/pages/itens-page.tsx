import type { PriceRecord } from '@grosify/shared';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../db/dexie.js';
import { seedCommonItems } from '../features/catalog/seed-items.js';
import { Button, Icon, PriceChange, SectionTitle, Sparkline, useMoneyParts } from '../features/ui/index.js';
import { useFormatMoney } from '../lib/use-currency.js';
import { useHydrateItemPhoto } from '../lib/use-hydrate-photo.js';
import { useLocalPref } from '../lib/use-local-pref.js';
import { useObjectUrl } from '../lib/use-object-url.js';

type StatusFilter = 'all' | 'instock' | 'low' | 'out';
interface SavedFilter {
  name: string;
  query: string;
  category: string;
  status: StatusFilter;
}

/** Inteligência de preço por item: menor visto, loja, variação e histórico. */
interface PriceInfo {
  cheapest: number;
  cheapestStoreId: string;
  history: number[];
  delta: number;
}

const RECENT_KEY = 'items.recent';
const SAVED_KEY = 'items.savedFilters';

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function ItensPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useLocalPref<'name' | 'category'>('items.sort', 'name');
  const [density, setDensity] = useLocalPref<'comfortable' | 'compact'>('items.density', 'comfortable');
  const compact = density === 'compact';
  const [recent, setRecent] = useState<string[]>(() => readJson<string[]>(RECENT_KEY, []));
  const [saved, setSaved] = useState<SavedFilter[]>(() => readJson<SavedFilter[]>(SAVED_KEY, []));

  const items = useLiveQuery(() => db.items.filter((i) => i.deletedAt === null).toArray(), [], [] as LocalItem[]);
  const brands = useLiveQuery(() => db.brands.filter((b) => b.deletedAt === null).toArray(), [], []);
  const inventory = useLiveQuery(() => db.inventory.filter((i) => i.deletedAt === null).toArray(), [], []);
  const prices = useLiveQuery(() => db.prices.filter((p) => p.deletedAt === null).toArray(), [], [] as PriceRecord[]);
  const stores = useLiveQuery(() => db.stores.filter((s) => s.deletedAt === null).toArray(), [], []);

  const storeName = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);

  const brandsByItem = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const b of brands) m.set(b.itemId, [...(m.get(b.itemId) ?? []), b.name.toLowerCase()]);
    return m;
  }, [brands]);
  const onHand = useMemo(() => new Map(inventory.map((i) => [i.itemId, Number(i.qtyOnHand)])), [inventory]);
  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [items],
  );

  // preço por item: histórico cronológico (sparkline), menor visto, última variação
  const priceInfo = useMemo(() => {
    const sorted = [...prices].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const hist = new Map<string, number[]>();
    const cheapestRec = new Map<string, { price: number; storeId: string }>();
    for (const p of sorted) {
      hist.set(p.itemId, [...(hist.get(p.itemId) ?? []), p.priceCents]);
      const cur = cheapestRec.get(p.itemId);
      if (!cur || p.priceCents < cur.price) cheapestRec.set(p.itemId, { price: p.priceCents, storeId: p.storeId });
    }
    const m = new Map<string, PriceInfo>();
    for (const [itemId, h] of hist) {
      const cr = cheapestRec.get(itemId)!;
      m.set(itemId, {
        cheapest: cr.price,
        cheapestStoreId: cr.storeId,
        history: h,
        delta: h.length >= 2 ? h[h.length - 1]! - h[h.length - 2]! : 0,
      });
    }
    return m;
  }, [prices]);

  function statusOf(item: LocalItem): StatusFilter {
    const q = onHand.get(item.id) ?? 0;
    if (q <= 0) return 'out';
    if (item.minStock != null && q <= item.minStock) return 'low';
    return 'instock';
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => {
        if (category && i.category !== category) return false;
        if (status !== 'all' && statusOf(i) !== status) return false;
        if (!q) return true;
        if (i.name.toLowerCase().includes(q)) return true;
        if (i.category?.toLowerCase().includes(q)) return true;
        return (brandsByItem.get(i.id) ?? []).some((b) => b.includes(q));
      })
      .sort((a, b) =>
        sort === 'category'
          ? (a.category ?? '~').localeCompare(b.category ?? '~') || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, category, status, sort, brandsByItem, onHand]);

  function commitSearch() {
    const q = query.trim();
    if (!q) return;
    const next = [q, ...recent.filter((r) => r !== q)].slice(0, 6);
    setRecent(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  function saveCurrent() {
    const name = query.trim() || t(`inventory.filter.${status}`);
    const sf: SavedFilter = { name, query, category, status };
    const next = [sf, ...saved.filter((s) => s.name !== name)].slice(0, 8);
    setSaved(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  }
  function applySaved(s: SavedFilter) {
    setQuery(s.query);
    setCategory(s.category);
    setStatus(s.status);
  }
  function deleteSaved(name: string) {
    const next = saved.filter((s) => s.name !== name);
    setSaved(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  }

  const STATUSES: StatusFilter[] = ['all', 'instock', 'low', 'out'];

  return (
    <main className="screen-in flex flex-col gap-3 px-[18px] py-6">
      <SectionTitle
        kicker={t('prices.intelKicker')}
        title={t('prices.title')}
        sub={t('prices.intelSub')}
      />


      <div className="card flex items-center gap-2.5" style={{ padding: '12px 14px' }}>
        <Icon name="search" size={18} className="text-[var(--app-gray)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={commitSearch}
          placeholder={t('search.placeholder')}
          className="flex-1 bg-transparent text-[15px] outline-none"
        />
      </div>

      {!query && recent.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recent.map((r) => (
            <button key={r} onClick={() => setQuery(r)} className="pill" style={{ background: 'var(--app-surface-2)' }}>
              🕘 {r}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="seg">
          {STATUSES.map((s) => (
            <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>
              {t(`search.status.${s}`)}
            </button>
          ))}
        </div>
        {categories.length > 0 && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="pill"
            style={{ background: 'var(--app-surface-2)', border: 0 }}
          >
            <option value="">{t('search.allCategories')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setSort(sort === 'name' ? 'category' : 'name')}
          className="pill"
          style={{ background: 'var(--app-surface-2)' }}
        >
          {sort === 'name' ? t('prefs.byName') : t('prefs.byCategory')}
        </button>
        <button onClick={saveCurrent} className="pill" style={{ background: 'var(--app-surface-2)' }}>
          {t('search.saveFilter')}
        </button>
        <button
          onClick={() => setDensity(compact ? 'comfortable' : 'compact')}
          className="pill ml-auto"
          style={{ background: 'var(--app-surface-2)' }}
        >
          {compact ? t('prefs.comfortable') : t('prefs.compact')}
        </button>
      </div>

      {saved.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {saved.map((s) => (
            <span key={s.name} className="pill" style={{ background: 'var(--app-surface-2)' }}>
              <button onClick={() => applySaved(s)}>⭐ {s.name}</button>
              <button onClick={() => deleteSaved(s.name)} className="text-[var(--app-gray)]">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-4">
          <p className="muted text-center">{t('catalog.noItems')}</p>
          {items.length === 0 && (
            <Button variant="secondary" size="md" onClick={() => seedCommonItems()}>
              {t('settings.seedItems')}
            </Button>
          )}
        </div>
      ) : (
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
          {filtered.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              compact={compact}
              info={priceInfo.get(item.id)}
              storeName={storeName}
            />
          ))}
        </div>
      )}

      <Link
        to="/itens/novo"
        className="fixed bottom-[calc(6rem_+_env(safe-area-inset-bottom))] left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-[var(--gro-green)] text-3xl text-white shadow-lg active:scale-95"
        aria-label={t('catalog.newItem')}
      >
        +
      </Link>
    </main>
  );
}

function ItemRow({
  item,
  compact,
  info,
  storeName,
}: {
  item: LocalItem;
  compact: boolean;
  info?: PriceInfo;
  storeName: Map<string, string>;
}) {
  const { t } = useTranslation();
  const fmt = useFormatMoney();
  const money = useMoneyParts();
  useHydrateItemPhoto(item.id, item.photoKey, item.photoBlob);
  const photoUrl = useObjectUrl(item.photoBlob);
  const size = compact ? 'h-9 w-9 text-base' : 'h-11 w-11 text-xl';
  // subtítulo: "mais barato em {loja}" quando há preço; senão categoria
  const cheapStore = info?.cheapestStoreId ? storeName.get(info.cheapestStoreId) : undefined;
  const subtitle = cheapStore ? t('prices.cheapestStore', { store: cheapStore }) : item.category;
  return (
    <Link
      to="/itens/$id"
      params={{ id: item.id }}
      className={`tap flex items-center gap-3 ${compact ? 'px-4 py-2' : 'px-4 py-3'}`}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className={`flex-none rounded-lg object-cover ${size}`} />
      ) : (
        <div className={`flex flex-none items-center justify-center rounded-lg bg-[var(--app-surface-2)] ${size}`}>
          🛒
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{item.name}</p>
        {!compact && subtitle && <p className="muted truncate text-sm">{subtitle}</p>}
      </div>
      {info && info.history.length >= 2 && <Sparkline data={info.history} />}
      <div className="text-right">
        {info ? (
          <>
            <div className="mono text-[15px] font-semibold">{fmt(info.cheapest)}</div>
            {info.delta !== 0 && <PriceChange deltaCents={info.delta} {...money} />}
          </>
        ) : (
          <span className="muted text-sm">{t(`catalog.units.${item.unit}`)}</span>
        )}
      </div>
    </Link>
  );
}
