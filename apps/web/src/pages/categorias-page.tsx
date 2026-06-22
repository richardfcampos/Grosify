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
import { Button, Icon, SectionTitle } from '../features/ui/index.js';

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
    <main className="screen-in flex flex-col gap-4 px-[18px] py-6 pb-28">
      <button
        onClick={() => navigate({ to: '/ajustes' })}
        className="muted flex items-center gap-1 text-sm font-semibold"
      >
        <Icon name="back" size={17} /> {t('common.back')}
      </button>
      <SectionTitle title={t('categories.title')} />

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={t('categories.newPlaceholder')}
          maxLength={100}
          className="gro-field"
        />
        <Button variant="primary" size="md" onClick={add} disabled={!newName.trim()} className="shrink-0">
          {t('common.add')}
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="muted mt-4 text-center">{t('categories.empty')}</p>
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
      className="card"
      style={{ padding: 12, ...(cat.color ? { borderLeftColor: cat.color, borderLeftWidth: 4 } : {}) }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">{cat.icon ?? '📦'}</span>
        <span
          className={`min-w-0 flex-1 truncate font-medium ${cat.isHidden ? 'muted line-through' : ''}`}
        >
          {cat.name}
        </span>
        <button onClick={onUp} disabled={first} className="muted px-1 disabled:opacity-30" aria-label="↑">
          ▲
        </button>
        <button onClick={onDown} disabled={last} className="muted px-1 disabled:opacity-30" aria-label="↓">
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
        <button
          onClick={onDelete}
          className="px-1"
          style={{ color: 'var(--gro-red)' }}
          aria-label={t('common.delete')}
        >
          🗑
        </button>
      </div>

      {editing && (
        <div className="mt-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--app-line)', paddingTop: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="gro-field" />
          <div className="flex flex-wrap gap-1.5">
            {CAT_ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => updateCategory(cat.id, { icon: cat.icon === ic ? null : ic })}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
                style={
                  cat.icon === ic
                    ? { background: 'var(--app-surface-2)', boxShadow: '0 0 0 2px var(--gro-green)' }
                    : { background: 'var(--app-surface-2)' }
                }
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
                style={{
                  backgroundColor: co,
                  ...(cat.color === co
                    ? { boxShadow: '0 0 0 2px var(--app-surface), 0 0 0 4px var(--app-ink)' }
                    : {}),
                }}
                className="h-7 w-7 rounded-full"
              />
            ))}
          </div>
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={() => {
              if (name.trim() && name.trim() !== cat.name) updateCategory(cat.id, { name: name.trim() });
              setEditing(false);
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      )}
    </li>
  );
}
