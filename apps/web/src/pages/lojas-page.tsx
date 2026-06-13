import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalStore } from '../db/dexie.js';
import { createStore, deleteStore, updateStore } from '../db/repositories.js';
import { usePlacesSearch, type PlaceResult } from '../lib/use-places-search.js';

const inputClass =
  'min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100';

export function LojasPage() {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<LocalStore | 'new' | null>(null);

  const stores = useLiveQuery(
    () => db.stores.filter((s) => s.deletedAt === null).toArray(),
    [],
    [] as LocalStore[],
  );

  return (
    <main className="flex flex-col gap-4 px-5 py-6">
      <h1 className="text-2xl font-bold text-zinc-900">{t('catalog.storesTitle')}</h1>

      {stores.length === 0 ? (
        <p className="mt-6 text-center text-zinc-500">{t('catalog.noStores')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...stores]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((store) => (
              <li key={store.id}>
                <button
                  onClick={() => setEditing(store)}
                  className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 p-4 text-left active:bg-zinc-50"
                >
                  <div>
                    <p className="font-medium text-zinc-900">{store.name}</p>
                    {(store.neighborhood || store.city) && (
                      <p className="text-sm text-zinc-500">
                        {[store.neighborhood, store.city].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  <span className="text-zinc-400">›</span>
                </button>
              </li>
            ))}
        </ul>
      )}

      <button
        onClick={() => setEditing('new')}
        className="fixed bottom-24 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-green-600 text-3xl text-white shadow-lg active:bg-green-700"
        aria-label={t('catalog.newStore')}
      >
        +
      </button>

      {editing && (
        <StoreSheet store={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </main>
  );
}

function StoreSheet({ store, onClose }: { store: LocalStore | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(store?.name ?? '');
  const [city, setCity] = useState(store?.city ?? '');
  const [neighborhood, setNeighborhood] = useState(store?.neighborhood ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    store?.lat != null && store?.lng != null ? { lat: store.lat, lng: store.lng } : null,
  );
  const [search, setSearch] = useState('');
  const [showResults, setShowResults] = useState(false);
  const { results } = usePlacesSearch(search);
  const [busy, setBusy] = useState(false);

  function pickPlace(p: PlaceResult) {
    setName(p.name);
    if (p.city) setCity(p.city);
    if (p.neighborhood) setNeighborhood(p.neighborhood);
    setCoords({ lat: p.lat, lng: p.lng });
    setSearch('');
    setShowResults(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      name: name.trim(),
      city: city.trim() || null,
      neighborhood: neighborhood.trim() || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    };
    if (store) await updateStore(store.id, payload);
    else await createStore(payload);
    onClose();
  }

  async function onDelete() {
    if (store && confirm(t('catalog.deleteStore') + '?')) {
      await deleteStore(store.id);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <h2 className="text-lg font-bold text-zinc-900">
          {store ? t('catalog.editStore') : t('catalog.newStore')}
        </h2>

        <div className="relative">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowResults(true);
            }}
            placeholder={t('catalog.searchPlaceHint')}
            className={inputClass}
          />
          {showResults && results.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
              {results.map((p, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => pickPlace(p)}
                    className="block w-full px-4 py-2.5 text-left text-sm active:bg-zinc-100"
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder={t('catalog.storeName')}
          className={inputClass}
        />
        <input
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          placeholder={t('catalog.neighborhood')}
          className={inputClass}
        />
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder={t('catalog.city')}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="min-h-12 w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white active:bg-green-700 disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>
        {store && (
          <button type="button" onClick={onDelete} className="min-h-11 text-sm font-medium text-red-600">
            {t('catalog.deleteStore')}
          </button>
        )}
        <p className="text-center text-xs text-zinc-400">{t('catalog.poweredBy')}</p>
      </form>
    </div>
  );
}
