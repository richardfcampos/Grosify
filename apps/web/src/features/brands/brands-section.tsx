import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/dexie.js';
import { createBrand, deleteBrand, setBrandPreferred } from '../../db/repositories.js';
import { useConfirm } from '../../lib/confirm.js';
import { Button } from '../ui/index.js';

/** Seção de marcas de um item (modo edição): listar, adicionar e remover. */
export function BrandsSection({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const brands = useLiveQuery(
    () => db.brands.where('itemId').equals(itemId).filter((b) => b.deletedAt === null).toArray(),
    [itemId],
    [],
  );
  const [name, setName] = useState('');

  async function add() {
    const n = name.trim();
    if (!n) return;
    await createBrand(itemId, n);
    setName('');
  }

  async function remove(id: string, label: string) {
    const ok = await confirm({
      title: t('brands.delete'),
      message: t('brands.deleteConfirm', { name: label }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (ok) await deleteBrand(id);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="muted text-sm font-medium">{t('brands.title')}</span>
      <p className="muted text-xs">{t('brands.hint')}</p>
      {brands.length === 0 ? (
        <p className="muted text-sm">{t('brands.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {[...brands]
            .sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred) || a.name.localeCompare(b.name))
            .map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ background: 'var(--app-surface-2)' }}
              >
                <button
                  type="button"
                  onClick={() => setBrandPreferred(itemId, b.id, !b.isPreferred)}
                  aria-label={t('brands.preferred')}
                  className={`text-lg leading-none ${b.isPreferred ? '' : 'opacity-30'}`}
                >
                  {b.isPreferred ? '⭐' : '☆'}
                </button>
                <span className="min-w-0 flex-1 truncate text-sm">{b.name}</span>
                <button
                  type="button"
                  onClick={() => remove(b.id, b.name)}
                  className="shrink-0 text-sm"
                  style={{ color: 'var(--gro-red)' }}
                >
                  {t('common.delete')}
                </button>
              </li>
            ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('brands.newPlaceholder')}
          maxLength={80}
          className="gro-field"
        />
        <Button variant="secondary" size="md" type="button" onClick={add} disabled={!name.trim()} className="shrink-0">
          {t('common.add')}
        </Button>
      </div>
    </div>
  );
}
