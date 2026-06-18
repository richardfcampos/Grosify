import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalCategory } from '../db/dexie.js';
import {
  createCategory,
  deleteCategory,
  reorderCategories,
  updateCategory,
} from '../db/repositories.js';
import { useConfirm } from '../lib/confirm.js';

const CAT_ICONS = ['🥦', '🥩', '🥛', '🍞', '🍎', '🧽', '🧴', '🐶', '🍷', '🧊', '🍫', '📦'];
const CAT_COLORS = ['#15803D', '#DC2626', '#CA8A04', '#2563EB', '#7C3AED', '#0D9488', '#DB2777'];

/** Gestão de categorias: criar, renomear, ícone/cor, reordenar, ocultar, excluir. */
export function CategoriasPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [newName, setNewName] = useState('');

  const cats = useLiveQuery(
    () => db.categories.filter((c) => c.deletedAt === null).toArray(),
    [],
    [] as LocalCategory[],
  );
  const sorted = [...cats].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  async function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= sorted.length) return;
    const ids = sorted.map((c) => c.id);
    [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    await reorderCategories(ids);
  }

  async function add() {
    const n = newName.trim();
    if (!n) return;
    await createCategory(n);
    setNewName('');
  }

  return (
    <main className="flex flex-col gap-4 px-5 py-6 pb-28">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: '/ajustes' })} className="text-sm text-zinc-500">
          ← {t('common.back')}
        </button>
        <h1 className="text-2xl font-bold text-zinc-900">{t('categories.title')}</h1>
      </header>

      {sorted.length === 0 ? (
        <p className="mt-4 text-center text-zinc-500">{t('categories.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((cat, i) => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              first={i === 0}
              last={i === sorted.length - 1}
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
            />
          ))}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-20 mx-auto flex max-w-md gap-2 px-5">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('categories.newPlaceholder')}
          maxLength={100}
          className="min-h-12 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm"
        />
        <button
          onClick={add}
          disabled={!newName.trim()}
          className="min-h-12 rounded-xl bg-green-600 px-5 font-semibold text-white disabled:opacity-40"
        >
          {t('common.add')}
        </button>
      </div>
    </main>
  );
}

function CategoryRow({
  cat,
  first,
  last,
  onUp,
  onDown,
}: {
  cat: LocalCategory;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);

  async function onDelete() {
    const ok = await confirm({
      title: t('categories.delete'),
      message: t('categories.deleteConfirm', { name: cat.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (ok) await deleteCategory(cat.id);
  }

  return (
    <li
      className="rounded-2xl border border-zinc-200 p-3"
      style={cat.color ? { borderLeftColor: cat.color, borderLeftWidth: 4 } : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">{cat.icon ?? '📦'}</span>
        <span className={`min-w-0 flex-1 truncate font-medium ${cat.isHidden ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>
          {cat.name}
        </span>
        <button onClick={onUp} disabled={first} className="px-1 text-zinc-400 disabled:opacity-30" aria-label="↑">
          ▲
        </button>
        <button onClick={onDown} disabled={last} className="px-1 text-zinc-400 disabled:opacity-30" aria-label="↓">
          ▼
        </button>
        <button
          onClick={() => updateCategory(cat.id, { isHidden: !cat.isHidden })}
          className="px-1 text-lg"
          aria-label={t('categories.hide')}
        >
          {cat.isHidden ? '🙈' : '👁'}
        </button>
        <button onClick={() => setEditing((v) => !v)} className="px-1 text-lg" aria-label={t('common.edit')}>
          ✏️
        </button>
        <button onClick={onDelete} className="px-1 text-red-600" aria-label={t('common.delete')}>
          🗑
        </button>
      </div>

      {editing && (
        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className="min-h-11 rounded-xl border border-zinc-300 px-3 text-base"
          />
          <div className="flex flex-wrap gap-1.5">
            {CAT_ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => updateCategory(cat.id, { icon: cat.icon === ic ? null : ic })}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${
                  cat.icon === ic ? 'bg-green-100 ring-2 ring-green-500' : 'bg-zinc-100'
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {CAT_COLORS.map((co) => (
              <button
                key={co}
                onClick={() => updateCategory(cat.id, { color: cat.color === co ? null : co })}
                style={{ backgroundColor: co }}
                className={`h-7 w-7 rounded-full ${cat.color === co ? 'ring-2 ring-offset-2 ring-zinc-900' : ''}`}
              />
            ))}
          </div>
          <button
            onClick={() => {
              if (name.trim() && name.trim() !== cat.name) updateCategory(cat.id, { name: name.trim() });
              setEditing(false);
            }}
            className="min-h-11 rounded-xl bg-green-600 font-semibold text-white"
          >
            {t('common.save')}
          </button>
        </div>
      )}
    </li>
  );
}
