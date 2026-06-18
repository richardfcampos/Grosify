import { UNITS, type Unit } from '@grosify/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../../db/dexie.js';
import { addBarcode, createItem } from '../../db/repositories.js';
import { lookupOpenFoodFacts } from '../../lib/openfoodfacts.js';
import { BrandPicker } from './brand-picker.js';

interface Props {
  code: string;
  /** Chamado depois que o código foi vinculado a um item (e marca opcional). */
  onResolved: (itemId: string, brandId: string | null) => void;
  onClose: () => void;
}

const input =
  'min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-green-600';

/**
 * Código de barras não cadastrado: escolher item existente ou criar um na hora,
 * depois escolher/criar a marca e vincular o código — tudo numa folha.
 */
export function UnknownBarcodeSheet({ code, onResolved, onClose }: Props) {
  const { t } = useTranslation();
  const items = useLiveQuery(
    () => db.items.filter((i) => i.deletedAt === null).toArray(),
    [],
    [] as LocalItem[],
  );

  const [itemId, setItemId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState<Unit>('un');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offState, setOffState] = useState<'idle' | 'looking' | 'found' | 'none'>('idle');

  // tenta preencher nome via OpenFoodFacts (online); fallback é criação manual
  useEffect(() => {
    let alive = true;
    setOffState('looking');
    lookupOpenFoodFacts(code).then((p) => {
      if (!alive) return;
      if (p?.name) {
        setNewName((prev) => prev || p.name!);
        setOffState('found');
      } else {
        setOffState('none');
      }
    });
    return () => {
      alive = false;
    };
  }, [code]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...items]
      .filter((i) => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [items, query]);

  const selectedName = items.find((i) => i.id === itemId)?.name ?? '';

  async function createNew() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const id = await createItem({ name, unit: newUnit, photoBlob: null, barcodes: [] });
      setItemId(id);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!itemId) return;
    setBusy(true);
    try {
      await addBarcode(itemId, code, brandId);
      onResolved(itemId, brandId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[88dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900">{t('barcode.unknownTitle')}</h2>
          <button onClick={onClose} className="text-sm text-zinc-500">
            {t('common.cancel')}
          </button>
        </div>
        <p className="font-mono text-sm text-zinc-500">{code}</p>

        {itemId ? (
          <>
            <div className="flex items-center justify-between rounded-xl bg-green-50 px-4 py-3">
              <span className="font-medium text-green-800">{selectedName}</span>
              <button
                onClick={() => {
                  setItemId(null);
                  setBrandId(null);
                }}
                className="text-sm text-green-700 underline"
              >
                {t('barcode.change')}
              </button>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-zinc-600">{t('brands.label')}</span>
              <BrandPicker itemId={itemId} value={brandId} onChange={setBrandId} />
            </label>
            <button
              onClick={save}
              disabled={busy}
              className="min-h-12 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('barcode.saveCode')}
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-zinc-600">{t('barcode.chooseItem')}</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('barcode.searchItem')}
              className={input}
            />
            {filtered.length > 0 && (
              <ul className="flex flex-col gap-1">
                {filtered.map((i) => (
                  <li key={i.id}>
                    <button
                      onClick={() => setItemId(i.id)}
                      className="min-h-11 w-full rounded-xl bg-zinc-100 px-4 text-left text-sm font-medium text-zinc-800 active:bg-zinc-200"
                    >
                      {i.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 border-t border-zinc-200 pt-3">
              <span className="text-sm font-medium text-zinc-600">{t('barcode.orCreate')}</span>
              {offState === 'looking' && (
                <p className="mt-1 text-xs text-zinc-400">{t('barcode.lookingUp')}</p>
              )}
              {offState === 'found' && (
                <p className="mt-1 text-xs text-green-600">{t('barcode.offFound')}</p>
              )}
              <div className="mt-2 flex flex-col gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('catalog.itemName')}
                  maxLength={200}
                  className={input}
                />
                <div className="flex gap-2">
                  <select
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value as Unit)}
                    className={input}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {t(`catalog.units.${u}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={createNew}
                    disabled={busy || !newName.trim()}
                    className="shrink-0 rounded-xl bg-green-600 px-4 font-semibold text-white disabled:opacity-40"
                  >
                    {t('barcode.createItem')}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
