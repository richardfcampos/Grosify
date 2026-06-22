import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/dexie.js';
import { createCategory } from '../../db/repositories.js';
import { Button } from '../ui/index.js';

const NEW = '__new__';

interface Props {
  value: string | null;
  onChange: (cat: { id: string; name: string } | null) => void;
}

/** Seletor de categoria (entidade) com "+ nova categoria" inline. */
export function CategoryPicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  const cats = useLiveQuery(
    () => db.categories.filter((c) => c.deletedAt === null && !c.isHidden).toArray(),
    [],
    [],
  );
  const sorted = [...cats].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  async function confirmNew() {
    const n = name.trim();
    if (!n) {
      setCreating(false);
      return;
    }
    const id = await createCategory(n);
    setName('');
    setCreating(false);
    onChange({ id, name: n });
  }

  if (creating) {
    return (
      <div className="flex gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('catalog.newCategory')}
          maxLength={100}
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
        else {
          const c = sorted.find((x) => x.id === e.target.value);
          onChange(c ? { id: c.id, name: c.name } : null);
        }
      }}
      className="gro-field"
    >
      <option value="">{t('catalog.noCategory')}</option>
      {sorted.map((c) => (
        <option key={c.id} value={c.id}>
          {c.icon ? `${c.icon} ` : ''}
          {c.name}
        </option>
      ))}
      <option value={NEW}>+ {t('catalog.newCategory')}</option>
    </select>
  );
}
