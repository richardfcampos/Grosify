import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalStore } from '../db/dexie.js';
import { createStore, deleteStore, updateStore } from '../db/repositories.js';
import { Button, Icon } from '../features/ui/index.js';
import { useConfirm } from '../lib/confirm.js';
import { usePlacesSearch, type PlaceResult } from '../lib/use-places-search.js';

const inputClass = 'gro-field';

export function LojasPage() {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<LocalStore | 'new' | null>(null);

  const stores = useLiveQuery(
    () => db.stores.filter((s) => s.deletedAt === null).toArray(),
    [],
    [] as LocalStore[],
  );

  return (
    <main className="screen-in flex flex-col gap-4 px-[18px] py-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('catalog.storesTitle')}</h1>

      {stores.length === 0 ? (
        <p className="muted mt-6 text-center">{t('catalog.noStores')}</p>
      ) : (
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
          {[...stores]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((store) => (
              <button
                key={store.id}
                onClick={() => setEditing(store)}
                className="tap flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <Icon name="store" size={20} className="flex-none text-[var(--app-gray)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{store.name}</p>
                  {(store.neighborhood || store.city) && (
                    <p className="muted truncate text-[12.5px]">
                      {[store.neighborhood, store.city].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <Icon name="chev" size={18} className="flex-none text-[var(--app-gray)]" />
              </button>
            ))}
        </div>
      )}

      <button
        onClick={() => setEditing('new')}
        className="fixed bottom-24 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-[var(--gro-green)] text-3xl text-white shadow-lg active:scale-95"
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
  const confirm = useConfirm();
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
    if (!store) return;
    const ok = await confirm({
      title: t('catalog.deleteStore'),
      message: t('lists.removeConfirm', { name: store.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (ok) {
      await deleteStore(store.id);
      onClose();
    }
  }

  return (
    <div className="gro-sheet-backdrop" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={onSubmit} className="gro-sheet-panel flex flex-col gap-3">
        <div className="gro-sheet-grip" />
        <h2 className="text-lg font-bold">
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
            <ul
              className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl shadow-lg"
              style={{ border: '1px solid var(--app-border)', background: 'var(--app-surface)' }}
            >
              {results.map((p, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => pickPlace(p)}
                    className="tap block w-full px-4 py-2.5 text-left text-sm"
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
        <Button variant="primary" size="lg" fullWidth type="submit" disabled={busy || !name.trim()}>
          {busy ? t('common.saving') : t('common.save')}
        </Button>
        {store && (
          <button type="button" onClick={onDelete} className="min-h-11 text-sm font-medium" style={{ color: 'var(--gro-red)' }}>
            {t('catalog.deleteStore')}
          </button>
        )}
        <p className="muted text-center text-xs">{t('catalog.poweredBy')}</p>
      </form>
    </div>
  );
}
