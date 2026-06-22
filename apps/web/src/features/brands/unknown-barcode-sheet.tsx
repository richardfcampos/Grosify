import { UNITS, type Unit } from '@grosify/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../../db/dexie.js';
import { addBarcode, createItem } from '../../db/repositories.js';
import { lookupOpenFoodFacts } from '../../lib/openfoodfacts.js';
import { BrandPicker } from './brand-picker.js';
import { Button } from '../ui/index.js';

interface Props {
  code: string;
  /** Chamado depois que o código foi vinculado a um item (e marca opcional). */
  onResolved: (itemId: string, brandId: string | null) => void;
  onClose: () => void;
}

const input = 'gro-field';

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
    <div className="gro-sheet-backdrop" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="gro-sheet-panel flex flex-col gap-3"
      >
        <div className="gro-sheet-grip" />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('barcode.unknownTitle')}</h2>
          <button onClick={onClose} className="muted text-sm">
            {t('common.cancel')}
          </button>
        </div>
        <p className="mono muted text-sm">{code}</p>

        {itemId ? (
          <>
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: 'var(--app-surface-2)' }}
            >
              <span className="font-medium">{selectedName}</span>
              <button
                onClick={() => {
                  setItemId(null);
                  setBrandId(null);
                }}
                className="text-sm underline"
                style={{ color: 'var(--gro-green)' }}
              >
                {t('barcode.change')}
              </button>
            </div>
            <label className="flex flex-col gap-1">
              <span className="kicker">{t('brands.label')}</span>
              <BrandPicker itemId={itemId} value={brandId} onChange={setBrandId} />
            </label>
            <Button variant="primary" size="lg" fullWidth onClick={save} disabled={busy}>
              {busy ? t('common.saving') : t('barcode.saveCode')}
            </Button>
          </>
        ) : (
          <>
            <span className="kicker">{t('barcode.chooseItem')}</span>
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
                      className="tap min-h-11 w-full rounded-xl px-4 text-left text-sm font-medium"
                      style={{ background: 'var(--app-surface-2)' }}
                    >
                      {i.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 pt-3" style={{ borderTop: '1px solid var(--app-border)' }}>
              <span className="kicker">{t('barcode.orCreate')}</span>
              {offState === 'looking' && (
                <p className="muted mt-1 text-xs">{t('barcode.lookingUp')}</p>
              )}
              {offState === 'found' && (
                <p className="mt-1 text-xs" style={{ color: 'var(--gro-green)' }}>
                  {t('barcode.offFound')}
                </p>
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
                  <Button
                    variant="primary"
                    size="md"
                    onClick={createNew}
                    disabled={busy || !newName.trim()}
                    className="shrink-0"
                  >
                    {t('barcode.createItem')}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
