import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem, type LocalSessionItem } from '../db/dexie.js';
import { Icon, MoneyValue, useMoneyParts } from '../features/ui/index.js';
import { useFormatMoney } from '../lib/use-currency.js';

/** Análise de gastos: por mês (barras planas), por categoria (barras de tinta), itens mais caros.
 *  Barras planas seguem o DESIGN.md (sem gráfico de pizza colorido). */
export function AnalyticsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormatMoney();
  const money = useMoneyParts();

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
    const byMonth = [...month.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([m, cents]) => ({ m, cents }));
    const byCategory = [...cat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name: name || t('catalog.noCategory'), value }));
    const topItems = [...item.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, cents]) => ({ name: itemById.get(id)?.name ?? '—', cents }));
    return { byMonth, byCategory, topItems, total };
  }, [bought, items, t]);

  const monthMax = Math.max(1, ...byMonth.map((m) => m.cents));
  const catMax = Math.max(1, ...byCategory.map((c) => c.value));
  const monthLabel = (ym: string) =>
    new Date(`${ym}-01T12:00`).toLocaleDateString(i18n.resolvedLanguage, { month: 'short' });
  const majorUnits = (cents: number) => Math.round(cents / 10 ** money.decimals);

  return (
    <main className="screen-in flex flex-col gap-5 px-[18px] py-6 pb-24">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: '/' })}
          className="muted flex items-center gap-1 text-sm font-semibold"
        >
          <Icon name="back" size={17} /> {t('common.back')}
        </button>
        <h1 className="text-2xl font-bold tracking-tight">{t('analytics.title')}</h1>
        {bought.length > 0 && (
          <button onClick={() => window.print()} className="pill ml-auto" style={{ background: 'var(--app-surface-2)' }}>
            {t('analytics.print')}
          </button>
        )}
      </header>

      {bought.length === 0 ? (
        <p className="muted mt-6 text-center">{t('analytics.empty')}</p>
      ) : (
        <>
          {/* total + barras por mês */}
          <div className="card" style={{ padding: 20 }}>
            <div className="kicker mb-1.5">{t('analytics.total')}</div>
            <MoneyValue cents={total} size="md" {...money} />
            <div className="mt-5 flex items-end gap-2" style={{ height: 120 }}>
              {byMonth.map((m, i) => (
                <div key={m.m} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="mono text-[10px] text-[var(--app-gray)]">{majorUnits(m.cents)}</div>
                  <div
                    style={{
                      width: '100%',
                      height: (m.cents / monthMax) * 84,
                      borderRadius: 'var(--app-radius) var(--app-radius) 3px 3px',
                      background: i === byMonth.length - 1 ? 'var(--gro-green)' : 'var(--app-surface-2)',
                      border: '1px solid var(--app-border)',
                      transition: 'height .4s var(--ease-out)',
                    }}
                  />
                  <div className="mono text-[11px] text-[var(--app-gray)]">{monthLabel(m.m)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* gasto por categoria (barras de tinta) */}
          <div>
            <div className="kicker mb-2.5">{t('analytics.spendByCategory')}</div>
            <div className="card flex flex-col gap-3" style={{ padding: 16 }}>
              {byCategory.map((c) => (
                <div key={c.name}>
                  <div className="mb-1.5 flex justify-between text-[13px]">
                    <span className="font-semibold">{c.name}</span>
                    <span className="muted mono">{fmt(c.value)}</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${(c.value / catMax) * 100}%`, background: 'var(--app-ink)', opacity: 0.82 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* itens mais caros */}
          <div>
            <div className="kicker mb-2.5">{t('analytics.topItems')}</div>
            <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
              {topItems.map((it, i) => (
                <div key={it.name} className="flex items-center gap-3 px-4 py-3">
                  <span className="mono text-[13px] text-[var(--app-gray)]" style={{ minWidth: 18 }}>
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-[14.5px] font-semibold">{it.name}</span>
                  <span className="mono font-semibold">{fmt(it.cents)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
