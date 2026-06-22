import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalSession, type LocalSessionItem } from '../db/dexie.js';
import { Icon, MoneyValue, PriceChange, SectionTitle, useMoneyParts } from '../features/ui/index.js';
import { useFormatMoney } from '../lib/use-currency.js';

/** Histórico de compras finalizadas: data, loja, total gasto, economia (estimado−pago) e acumulado. */
export function HistoricoPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormatMoney();
  const money = useMoneyParts();

  const sessions = useLiveQuery(
    () => db.sessions.filter((s) => s.deletedAt === null && s.status === 'completed').toArray(),
    [],
    [] as LocalSession[],
  );
  const sessionItems = useLiveQuery(
    () => db.sessionItems.filter((s) => s.deletedAt === null && s.checkedAt != null).toArray(),
    [],
    [] as LocalSessionItem[],
  );
  const stores = useLiveQuery(() => db.stores.filter((s) => s.deletedAt === null).toArray(), [], []);

  const storeName = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);

  const { rows, totalSaved } = useMemo(() => {
    const agg = new Map<string, { total: number; count: number; saved: number }>();
    for (const si of sessionItems) {
      if (si.actualQty == null || si.actualUnitPriceCents == null) continue;
      const a = agg.get(si.sessionId) ?? { total: 0, count: 0, saved: 0 };
      a.total += Math.round(Number(si.actualQty) * si.actualUnitPriceCents);
      a.count += 1;
      if (si.estimatedUnitPriceCents != null)
        a.saved += Math.round((si.estimatedUnitPriceCents - si.actualUnitPriceCents) * Number(si.actualQty));
      agg.set(si.sessionId, a);
    }
    const rows = [...sessions]
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
      .map((s) => ({ s, ...(agg.get(s.id) ?? { total: 0, count: 0, saved: 0 }) }));
    const totalSaved = rows.reduce((sum, r) => sum + r.saved, 0);
    return { rows, totalSaved };
  }, [sessions, sessionItems]);

  const dayPart = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(i18n.resolvedLanguage, { day: '2-digit' }) : '';
  const monthPart = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(i18n.resolvedLanguage, { month: 'short' }).replace('.', '') : '';

  return (
    <main className="screen-in flex flex-col gap-4 px-[18px] py-6 pb-24">
      <button
        onClick={() => navigate({ to: '/' })}
        className="muted flex items-center gap-1 text-sm font-semibold"
      >
        <Icon name="back" size={17} /> {t('common.back')}
      </button>
      <SectionTitle title={t('history.title')} />

      {rows.length === 0 ? (
        <p className="muted mt-6 text-center">{t('history.empty')}</p>
      ) : (
        <>
          <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
            {rows.map(({ s, total, count, saved }) => (
              <button
                key={s.id}
                onClick={() => navigate({ to: '/compra/$id', params: { id: s.id } })}
                className="tap flex w-full items-center gap-3.5 px-4 py-3.5 text-left"
              >
                <div className="text-center" style={{ minWidth: 46 }}>
                  <div className="mono text-[11px] uppercase text-[var(--app-gray)]">{monthPart(s.completedAt)}</div>
                  <div style={{ fontFamily: 'var(--gro-font-money)', fontSize: 24, lineHeight: 1 }}>
                    {dayPart(s.completedAt)}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {(s.storeId && storeName.get(s.storeId)) || t('shopping.activeStore')}
                  </div>
                  <div className="muted mono mt-0.5 text-[12.5px]">{t('shopping.itemsBought', { count })}</div>
                </div>
                <div className="text-right">
                  <div className="mono text-base font-semibold">{fmt(total)}</div>
                  {saved !== 0 && <PriceChange deltaCents={-saved} {...money} />}
                </div>
              </button>
            ))}
          </div>

          {totalSaved > 0 && (
            <div className="card flex items-center justify-between" style={{ padding: '14px 16px' }}>
              <span className="kicker">{t('history.accumulatedSavings')}</span>
              <MoneyValue cents={totalSaved} size="sm" tone="positive" {...money} />
            </div>
          )}
        </>
      )}
    </main>
  );
}
