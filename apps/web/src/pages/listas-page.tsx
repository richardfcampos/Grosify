import { parseToMinorUnits, RECURRENCES, type Recurrence } from '@grosify/shared';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalList } from '../db/dexie.js';
import { createList } from '../db/repositories.js';
import { Badge, Button, Empty, Icon } from '../features/ui/index.js';
import { useHouseholdCurrency } from '../lib/use-currency.js';

const LIST_ICONS = ['🛒', '🔥', '🎉', '🥩', '🧺', '🍎', '🧽', '🎂', '🍷', '🐶'];
const LIST_COLORS = ['#15803D', '#DC2626', '#CA8A04', '#2563EB', '#7C3AED', '#0D9488', '#DB2777'];

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
    <main className="screen-in flex flex-col gap-4 px-[18px] py-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('lists.title')}</h1>

      {lists.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <Empty
            icon="list"
            title={t('lists.title')}
            body={t('lists.noLists')}
            action={
              <Button variant="primary" size="md" onClick={() => setCreating(true)}>
                <Icon name="plus" size={18} /> {t('lists.newList')}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
          {[...lists]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((list) => (
              <Link
                key={list.id}
                to="/listas/$id"
                params={{ id: list.id }}
                className="tap flex items-center gap-3 px-4 py-3.5"
                style={
                  list.color ? { borderLeft: `4px solid ${list.color}` } : undefined
                }
              >
                {list.icon && <span className="flex-none text-2xl">{list.icon}</span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{list.name}</p>
                  <p className="muted text-sm">
                    {countByList.get(list.id) ?? 0} {t('nav.items').toLowerCase()}
                  </p>
                </div>
                <Badge tone="neutral" className="shrink-0">
                  {list.isRecurring
                    ? t(`lists.recurrenceTag.${list.recurrence ?? 'monthly'}`)
                    : t('lists.oneTimeTag')}
                </Badge>
              </Link>
            ))}
        </div>
      )}

      <button
        onClick={() => setCreating(true)}
        className="fixed bottom-24 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-[var(--gro-green)] text-3xl text-white shadow-lg active:scale-95"
        aria-label={t('lists.newList')}
      >
        +
      </button>

      {creating && <NewListSheet onClose={() => setCreating(false)} />}
    </main>
  );
}

function NewListSheet({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const currency = useHouseholdCurrency();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [budget, setBudget] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<Recurrence>('monthly');
  const [recurrenceDay, setRecurrenceDay] = useState(1);
  const [busy, setBusy] = useState(false);

  const weekly = recurrence === 'weekly' || recurrence === 'biweekly';
  // rótulos de dia da semana no idioma atual
  const weekdays = Array.from({ length: 7 }, (_, d) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, { weekday: 'short' }).format(new Date(2024, 0, 7 + d)),
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    let budgetCents: number | null = null;
    try {
      budgetCents = budget.trim() ? parseToMinorUnits(budget, currency) : null;
    } catch {
      budgetCents = null;
    }
    await createList({
      name: name.trim(),
      isRecurring,
      budgetCents,
      icon,
      color,
      recurrence: isRecurring ? recurrence : null,
      recurrenceDay: isRecurring ? recurrenceDay : null,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="mx-auto flex max-h-[88dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
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

        <span className="text-sm font-medium text-zinc-600">{t('lists.icon')}</span>
        <div className="flex flex-wrap gap-1.5">
          {LIST_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => setIcon(icon === ic ? null : ic)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${
                icon === ic ? 'bg-green-100 ring-2 ring-green-500' : 'bg-zinc-100'
              }`}
            >
              {ic}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-600">{t('lists.budget')}</span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/[^\d.,]/g, ''))}
            inputMode="decimal"
            placeholder={t('lists.budgetHint')}
            className="min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base"
          />
        </label>

        <span className="text-sm font-medium text-zinc-600">{t('lists.color')}</span>
        <div className="flex flex-wrap gap-2">
          {LIST_COLORS.map((co) => (
            <button
              key={co}
              type="button"
              onClick={() => setColor(color === co ? null : co)}
              style={{ backgroundColor: co }}
              className={`h-8 w-8 rounded-full ${color === co ? 'ring-2 ring-offset-2 ring-zinc-900' : ''}`}
            />
          ))}
        </div>

        <label className="flex items-center gap-3 py-1">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="h-5 w-5 accent-green-600"
          />
          <span className="text-zinc-700">{t('lists.recurring')}</span>
        </label>

        {isRecurring && (
          <div className="flex gap-2">
            <select
              value={recurrence}
              onChange={(e) => {
                const r = e.target.value as Recurrence;
                setRecurrence(r);
                const isWeekly = r === 'weekly' || r === 'biweekly';
                setRecurrenceDay((d) => (isWeekly ? Math.min(d, 6) : Math.max(d, 1)));
              }}
              className="min-h-11 flex-1 rounded-xl border border-zinc-300 px-3 text-base"
            >
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {t(`lists.recurrenceTag.${r}`)}
                </option>
              ))}
            </select>
            <select
              value={recurrenceDay}
              onChange={(e) => setRecurrenceDay(Number(e.target.value))}
              className="min-h-11 flex-1 rounded-xl border border-zinc-300 px-3 text-base"
            >
              {weekly
                ? weekdays.map((label, d) => (
                    <option key={d} value={d}>
                      {label}
                    </option>
                  ))
                : Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {t('lists.dayOfMonth', { day: d })}
                    </option>
                  ))}
            </select>
          </div>
        )}

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
