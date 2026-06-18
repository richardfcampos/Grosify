import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../db/dexie.js';
import { seedCommonItems } from '../features/catalog/seed-items.js';
import { useLocalPref } from '../lib/use-local-pref.js';
import { useObjectUrl } from '../lib/use-object-url.js';

export function ItensPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  // preferências de exibição (por dispositivo)
  const [sort, setSort] = useLocalPref<'name' | 'category'>('items.sort', 'name');
  const [density, setDensity] = useLocalPref<'comfortable' | 'compact'>('items.density', 'comfortable');
  const compact = density === 'compact';

  const items = useLiveQuery(
    () => db.items.filter((i) => i.deletedAt === null).toArray(),
    [],
    [] as LocalItem[],
  );

  const filtered = items
    .filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) =>
      sort === 'category'
        ? (a.category ?? '~').localeCompare(b.category ?? '~') || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );

  return (
    <main className="flex flex-col gap-4 px-5 py-6">
      <h1 className="text-2xl font-bold text-zinc-900">{t('catalog.itemsTitle')}</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('catalog.searchItems')}
        className="min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
      />

      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-400">{t('prefs.sortBy')}</span>
        <button
          onClick={() => setSort(sort === 'name' ? 'category' : 'name')}
          className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700"
        >
          {sort === 'name' ? t('prefs.byName') : t('prefs.byCategory')}
        </button>
        <button
          onClick={() => setDensity(compact ? 'comfortable' : 'compact')}
          className="ml-auto rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700"
        >
          {compact ? t('prefs.comfortable') : t('prefs.compact')}
        </button>
      </div>

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
          {!compact && item.category && (
            <p className="truncate text-sm text-zinc-500">{item.category}</p>
          )}
        </div>
        <span className="text-sm text-zinc-400">{t(`catalog.units.${item.unit}`)}</span>
      </Link>
    </li>
  );
}
