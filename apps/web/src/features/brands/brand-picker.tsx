import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/dexie.js';
import { createBrand } from '../../db/repositories.js';

interface Props {
  itemId: string;
  value: string | null;
  onChange: (brandId: string | null) => void;
  /** Tema escuro (folha do modo compra) vs claro (catálogo). */
  dark?: boolean;
}

const NEW = '__new__';

/**
 * Seletor de marca de um item: dropdown com "sem marca", marcas existentes e
 * "+ nova marca" (cria na hora). Reutilizado no modo compra e no registro de preço.
 */
export function BrandPicker({ itemId, value, onChange, dark }: Props) {
  const { t } = useTranslation();
  const brands = useLiveQuery(
    () => db.brands.where('itemId').equals(itemId).filter((b) => b.deletedAt === null).toArray(),
    [itemId],
    [],
  );
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const base = dark
    ? 'min-h-12 w-full rounded-xl border border-stone-700 bg-stone-900 px-4 py-3 text-base text-stone-50 outline-none focus:border-yellow-400'
    : 'min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base';

  async function confirmNew() {
    const n = name.trim();
    if (!n) {
      setCreating(false);
      return;
    }
    const id = await createBrand(itemId, n);
    setName('');
    setCreating(false);
    onChange(id);
  }

  if (creating) {
    return (
      <div className="flex gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('brands.newPlaceholder')}
          maxLength={80}
          className={base}
        />
        <button
          type="button"
          onClick={confirmNew}
          className="shrink-0 rounded-xl bg-green-600 px-4 font-semibold text-white"
        >
          {t('common.add')}
        </button>
      </div>
    );
  }

  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value === NEW) setCreating(true);
        else onChange(e.target.value || null);
      }}
      className={base}
    >
      <option value="">{t('brands.none')}</option>
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
      <option value={NEW}>+ {t('brands.new')}</option>
    </select>
  );
}
