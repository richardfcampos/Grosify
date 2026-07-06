import { applyFreeCaps, maxLists, parseToMinorUnits, RECURRENCES, type Recurrence } from '@grosify/shared';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalList } from '../db/dexie.js';
import { createList } from '../db/repositories.js';
import { HiddenDataBanner } from '../features/billing/hidden-data-banner.js';
import { NlReview } from '../features/nl-list/nl-review.js';
import { Badge, Button, Empty, Icon } from '../features/ui/index.js';
import { useHouseholdCurrency, useHouseholdPlan } from '../lib/use-currency.js';

const LIST_ICONS = ['🛒', '🔥', '🎉', '🥩', '🧺', '🍎', '🧽', '🎂', '🍷', '🐶'];
const LIST_COLORS = ['#15803D', '#DC2626', '#CA8A04', '#2563EB', '#7C3AED', '#0D9488', '#DB2777'];

export function ListasPage() {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const plan = useHouseholdPlan();

  const allLists = useLiveQuery(
    () => db.lists.filter((l) => l.deletedAt === null).toArray(),
    [],
    [] as LocalList[],
  );
  // Filtro de leitura no downgrade: free vê só as listas mais antigas até o teto.
  const lists = useMemo(() => applyFreeCaps(allLists, maxLists(plan), plan), [allLists, plan]);
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

      <HiddenDataBanner />

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
                {list.isPrivate && (
                  <Badge tone="neutral" className="shrink-0">
                    🔒 {t('lists.privateTag')}
                  </Badge>
                )}
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
        className="fixed bottom-[calc(6rem_+_env(safe-area-inset-bottom))] left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-[var(--gro-green)] text-3xl text-white shadow-lg active:scale-95"
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
  const [isPrivate, setIsPrivate] = useState(false);
  const [recurrence, setRecurrence] = useState<Recurrence>('monthly');
  const [recurrenceDay, setRecurrenceDay] = useState(1);
  const [nlPrompt, setNlPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  // Preenchendo o texto e submetendo, a criação vira revisão de lista gerada
  // (a lista só nasce ao confirmar a revisão — `NlReview` chama `createList`).
  const [reviewing, setReviewing] = useState(false);

  const weekly = recurrence === 'weekly' || recurrence === 'biweekly';
  // rótulos de dia da semana no idioma atual
  const weekdays = Array.from({ length: 7 }, (_, d) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, { weekday: 'short' }).format(new Date(2024, 0, 7 + d)),
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Campo de texto preenchido → caminho nl-list: abre a revisão em vez de
    // criar a lista vazia direto (AC NL entrada dupla, ponto a).
    if (nlPrompt.trim()) {
      setReviewing(true);
      return;
    }
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
      isPrivate,
      budgetCents,
      icon,
      color,
      recurrence: isRecurring ? recurrence : null,
      recurrenceDay: isRecurring ? recurrenceDay : null,
    });
    onClose();
  }

  if (reviewing) {
    return (
      <NlReview prompt={nlPrompt.trim()} target={{ kind: 'new', name: name.trim() }} onClose={onClose} />
    );
  }

  return (
    <div className="gro-sheet-backdrop" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={onSubmit} className="gro-sheet-panel flex flex-col gap-3">
        <div className="gro-sheet-grip" />
        <h2 className="text-lg font-bold">{t('lists.newList')}</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
          placeholder={t('lists.listNameHint')}
          className="gro-field"
        />

        <label className="flex flex-col gap-1">
          <span className="muted text-sm font-medium">{t('nlList.textFieldLabel')}</span>
          <textarea
            value={nlPrompt}
            onChange={(e) => setNlPrompt(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={t('nlList.textFieldPlaceholder')}
            className="gro-field"
          />
        </label>

        <span className="muted text-sm font-medium">{t('lists.icon')}</span>
        <div className="flex flex-wrap gap-1.5">
          {LIST_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => setIcon(icon === ic ? null : ic)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${
                icon === ic ? 'bg-[var(--app-surface-2)] ring-2 ring-[var(--gro-green)]' : 'bg-[var(--app-surface-2)]'
              }`}
            >
              {ic}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1">
          <span className="muted text-sm font-medium">{t('lists.budget')}</span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/[^\d.,]/g, ''))}
            inputMode="decimal"
            placeholder={t('lists.budgetHint')}
            className="gro-field gro-field--mono"
          />
        </label>

        <span className="muted text-sm font-medium">{t('lists.color')}</span>
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
            className="h-5 w-5"
            style={{ accentColor: 'var(--gro-green)' }}
          />
          <span>{t('lists.recurring')}</span>
        </label>

        <label className="flex items-center gap-3 py-1">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="h-5 w-5"
            style={{ accentColor: 'var(--gro-green)' }}
          />
          <span>{t('lists.private')}</span>
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
              className="gro-field flex-1"
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
              className="gro-field flex-1"
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

        <Button variant="primary" size="lg" fullWidth type="submit" disabled={busy || !name.trim()}>
          {busy ? t('common.saving') : t('common.save')}
        </Button>
      </form>
    </div>
  );
}
