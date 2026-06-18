import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../db/dexie.js';
import { seedCommonItems } from '../features/catalog/seed-items.js';
import { useLocalPref } from '../lib/use-local-pref.js';
import { useObjectUrl } from '../lib/use-object-url.js';

type StatusFilter = 'all' | 'instock' | 'low' | 'out';
interface SavedFilter {
  name: string;
  query: string;
  category: string;
  status: StatusFilter;
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
    <main className="flex flex-col gap-3 px-5 py-6">
      <h1 className="text-2xl font-bold text-zinc-900">{t('catalog.itemsTitle')}</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={commitSearch}
        placeholder={t('search.placeholder')}
        className="min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
      />

      {!query && recent.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recent.map((r) => (
            <button key={r} onClick={() => setQuery(r)} className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-600">
              🕘 {r}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-full bg-zinc-100 px-3 py-1.5 text-sm text-zinc-700"
        >
          <option value="">{t('search.allCategories')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              status === s ? 'bg-green-600 text-white' : 'bg-zinc-100 text-zinc-600'
            }`}
          >
            {t(`search.status.${s}`)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setSort(sort === 'name' ? 'category' : 'name')}
          className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700"
        >
          {sort === 'name' ? t('prefs.byName') : t('prefs.byCategory')}
        </button>
        <button onClick={saveCurrent} className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700">
          {t('search.saveFilter')}
        </button>
        <button
          onClick={() => setDensity(compact ? 'comfortable' : 'compact')}
          className="ml-auto rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700"
        >
          {compact ? t('prefs.comfortable') : t('prefs.compact')}
        </button>
      </div>

      {saved.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {saved.map((s) => (
            <span key={s.name} className="flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-sm text-green-700">
              <button onClick={() => applySaved(s)}>⭐ {s.name}</button>
              <button onClick={() => deleteSaved(s.name)} className="text-green-500">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-4">
          <p className="text-center text-zinc-500">{t('catalog.noItems')}</p>
          {items.length === 0 && (
            <button
              onClick={() => seedCommonItems()}
              className="rounded-xl border border-green-600 px-4 py-2.5 text-sm font-semibold text-green-700"
            >
              {t('settings.seedItems')}
            </button>
          )}
        </div>
      ) : (
        <ul className={`flex flex-col ${compact ? 'gap-1' : 'gap-2'}`}>
          {filtered.map((item) => (
            <ItemRow key={item.id} item={item} compact={compact} />
          ))}
        </ul>
      )}

      <Link
        to="/itens/novo"
        className="fixed bottom-24 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-green-600 text-3xl text-white shadow-lg active:bg-green-700"
        aria-label={t('catalog.newItem')}
      >
        +
      </Link>
    </main>
  );
}

function ItemRow({ item, compact }: { item: LocalItem; compact: boolean }) {
  const { t } = useTranslation();
  const photoUrl = useObjectUrl(item.photoBlob);
  const size = compact ? 'h-9 w-9 text-base' : 'h-12 w-12 text-xl';
  return (
    <li>
      <Link
        to="/itens/$id"
        params={{ id: item.id }}
        className={`flex items-center gap-3 rounded-2xl border border-zinc-200 active:bg-zinc-50 ${
          compact ? 'p-2' : 'p-3'
        }`}
      >
        {photoUrl ? (
          <img src={photoUrl} alt="" className={`rounded-lg object-cover ${size}`} />
        ) : (
          <div className={`flex items-center justify-center rounded-lg bg-zinc-100 ${size}`}>🛒</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-zinc-900">{item.name}</p>
          {!compact && item.category && <p className="truncate text-sm text-zinc-500">{item.category}</p>}
        </div>
        <span className="text-sm text-zinc-400">{t(`catalog.units.${item.unit}`)}</span>
      </Link>
    </li>
  );
}
