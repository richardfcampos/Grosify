import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalList } from '../db/dexie.js';
import { createList } from '../db/repositories.js';

export function ListasPage() {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);

  const lists = useLiveQuery(
    () => db.lists.filter((l) => l.deletedAt === null).toArray(),
    [],
    [] as LocalList[],
  );
  const entries = useLiveQuery(
    () => db.listEntries.filter((e) => e.deletedAt === null).toArray(),
    [],
    [],
  );

  const countByList = new Map<string, number>();
  for (const e of entries) countByList.set(e.listId, (countByList.get(e.listId) ?? 0) + 1);

  return (
    <main className="flex flex-col gap-4 px-5 py-6">
      <h1 className="text-2xl font-bold text-zinc-900">{t('lists.title')}</h1>

      {lists.length === 0 ? (
        <p className="mt-6 text-center text-zinc-500">{t('lists.noLists')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...lists]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((list) => (
              <li key={list.id}>
                <Link
                  to="/listas/$id"
                  params={{ id: list.id }}
                  className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4 active:bg-zinc-50"
                >
                  <div>
                    <p className="font-medium text-zinc-900">{list.name}</p>
                    <p className="text-sm text-zinc-500">
                      {countByList.get(list.id) ?? 0} {t('nav.items').toLowerCase()}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      list.isRecurring
                        ? 'bg-green-100 text-green-700'
                        : 'bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    {list.isRecurring ? t('lists.recurringTag') : t('lists.oneTimeTag')}
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      )}

      <button
        onClick={() => setCreating(true)}
        className="fixed bottom-24 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-green-600 text-3xl text-white shadow-lg active:bg-green-700"
        aria-label={t('lists.newList')}
      >
        +
      </button>

      {creating && <NewListSheet onClose={() => setCreating(false)} />}
    </main>
  );
}

function NewListSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await createList(name.trim(), isRecurring);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <h2 className="text-lg font-bold text-zinc-900">{t('lists.newList')}</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
          placeholder={t('lists.listNameHint')}
          className="min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
        />
        <label className="flex items-center gap-3 py-1">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="h-5 w-5 accent-green-600"
          />
          <span className="text-zinc-700">{t('lists.recurring')}</span>
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="min-h-12 w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white active:bg-green-700 disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </form>
    </div>
  );
}
