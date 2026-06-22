import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/dexie.js';
import { createBrand } from '../../db/repositories.js';
import { Button } from '../ui/index.js';

interface Props {
  itemId: string;
  value: string | null;
  onChange: (brandId: string | null) => void;
}

const NEW = '__new__';

/**
 * Seletor de marca de um item: dropdown com "sem marca", marcas existentes e
 * "+ nova marca" (cria na hora). Reutilizado no modo compra e no registro de preço.
 * Usa tokens (.gro-field) — adapta a claro/escuro pelo cascade do contexto.
 */
export function BrandPicker({ itemId, value, onChange }: Props) {
  const { t } = useTranslation();
  const brands = useLiveQuery(
    () => db.brands.where('itemId').equals(itemId).filter((b) => b.deletedAt === null).toArray(),
    [itemId],
    [],
  );
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  // pré-seleciona a marca preferida do item (uma vez), se nada foi escolhido ainda
  const autoApplied = useRef(false);
  useEffect(() => {
    if (autoApplied.current) return;
    if (value != null) {
      autoApplied.current = true;
      return;
    }
    const pref = brands.find((b) => b.isPreferred);
    if (pref) {
      autoApplied.current = true;
      onChange(pref.id);
    }
  }, [brands, value, onChange]);

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
          className="gro-field"
        />
        <Button variant="primary" size="md" type="button" onClick={confirmNew} className="shrink-0">
          {t('common.add')}
        </Button>
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
      className="gro-field"
    >
      <option value="">{t('brands.none')}</option>
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.isPreferred ? `⭐ ${b.name}` : b.name}
        </option>
      ))}
      <option value={NEW}>+ {t('brands.new')}</option>
    </select>
  );
}
