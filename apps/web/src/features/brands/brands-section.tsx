import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/dexie.js';
import { createBrand, deleteBrand } from '../../db/repositories.js';
import { useConfirm } from '../../lib/confirm.js';

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
      <span className="text-sm font-medium text-zinc-600">{t('brands.title')}</span>
      <p className="text-xs text-zinc-400">{t('brands.hint')}</p>
      {brands.length === 0 ? (
        <p className="text-sm text-zinc-400">{t('brands.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {brands.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-2"
            >
              <span className="text-sm text-zinc-800">{b.name}</span>
              <button
                type="button"
                onClick={() => remove(b.id, b.name)}
                className="text-sm text-red-600"
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
          className="min-h-11 flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 text-base"
        />
        <button
          type="button"
          onClick={add}
          disabled={!name.trim()}
          className="shrink-0 rounded-xl border border-green-600 px-4 text-sm font-semibold text-green-700 disabled:opacity-40"
        >
          {t('common.add')}
        </button>
      </div>
    </div>
  );
}
