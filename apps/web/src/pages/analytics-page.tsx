import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db, type LocalItem, type LocalSessionItem } from '../db/dexie.js';
import { useFormatMoney } from '../lib/use-currency.js';

const PIE_COLORS = ['#15803D', '#CA8A04', '#2563EB', '#DC2626', '#7C3AED', '#0D9488', '#DB2777', '#52525B'];

/** Análise de gastos: por mês (barras), por categoria (pizza), itens mais caros. */
export function AnalyticsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormatMoney();

  const bought = useLiveQuery(
    () =>
      db.sessionItems
        .filter(
          (s) =>
            s.deletedAt === null &&
            s.checkedAt != null &&
            s.actualQty != null &&
            s.actualUnitPriceCents != null,
        )
        .toArray(),
    [],
    [] as LocalSessionItem[],
  );
  const items = useLiveQuery(
    () => db.items.filter((i) => i.deletedAt === null).toArray(),
    [],
    [] as LocalItem[],
  );

  const { byMonth, byCategory, topItems, total } = useMemo(() => {
    const itemById = new Map(items.map((i) => [i.id, i]));
    const spendOf = (s: LocalSessionItem) =>
      Math.round(Number(s.actualQty) * (s.actualUnitPriceCents ?? 0));

    const month = new Map<string, number>();
    const cat = new Map<string, number>();
    const item = new Map<string, number>();
    let total = 0;
    for (const s of bought) {
      const cents = spendOf(s);
      total += cents;
      const m = (s.checkedAt ?? '').slice(0, 7);
      month.set(m, (month.get(m) ?? 0) + cents);
      const c = itemById.get(s.itemId)?.category ?? '';
      cat.set(c, (cat.get(c) ?? 0) + cents);
      item.set(s.itemId, (item.get(s.itemId) ?? 0) + cents);
    }
    const byMonth = [...month.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([m, cents]) => ({ m, cents }));
    const byCategory = [...cat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name: name || t('catalog.noCategory'), value }));
    const topItems = [...item.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, cents]) => ({ name: itemById.get(id)?.name ?? '—', cents }));
    return { byMonth, byCategory, topItems, total };
  }, [bought, items, t]);

  return (
    <main className="flex flex-col gap-6 px-5 py-6 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: '/' })} className="text-sm text-zinc-500">
          ← {t('common.back')}
        </button>
        <h1 className="text-2xl font-bold text-zinc-900">{t('analytics.title')}</h1>
      </header>

      {bought.length === 0 ? (
        <p className="mt-6 text-center text-zinc-500">{t('analytics.empty')}</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {t('analytics.spendByMonth')}
            </h2>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byMonth} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis dataKey="m" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => fmt(Number(v))} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Bar dataKey="cents" fill="#15803D" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {t('analytics.spendByCategory')}
            </h2>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={80} label={false}>
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-col gap-1">
              {byCategory.map((c, i) => (
                <li key={c.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-zinc-600">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {c.name}
                  </span>
                  <span className="font-mono text-zinc-900">{fmt(c.value)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {t('analytics.topItems')}
            </h2>
            <ul className="flex flex-col gap-1">
              {topItems.map((it) => (
                <li key={it.name} className="flex justify-between text-sm">
                  <span className="truncate text-zinc-700">{it.name}</span>
                  <span className="font-mono text-zinc-900">{fmt(it.cents)}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-center text-sm text-zinc-500">
            {t('analytics.total')}: <span className="font-mono font-semibold text-zinc-900">{fmt(total)}</span>
          </p>
        </>
      )}
    </main>
  );
}
