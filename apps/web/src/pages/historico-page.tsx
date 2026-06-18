import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalSession, type LocalSessionItem } from '../db/dexie.js';
import { useFormatMoney } from '../lib/use-currency.js';

/** Histórico de compras finalizadas: data, total gasto e nº de itens. */
export function HistoricoPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormatMoney();

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

  const rows = useMemo(() => {
    const bySession = new Map<string, { total: number; count: number }>();
    for (const si of sessionItems) {
      if (si.actualQty == null || si.actualUnitPriceCents == null) continue;
      const agg = bySession.get(si.sessionId) ?? { total: 0, count: 0 };
      agg.total += Math.round(Number(si.actualQty) * si.actualUnitPriceCents);
      agg.count += 1;
      bySession.set(si.sessionId, agg);
    }
    return [...sessions]
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
      .map((s) => ({ s, ...(bySession.get(s.id) ?? { total: 0, count: 0 }) }));
  }, [sessions, sessionItems]);

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(i18n.resolvedLanguage) : '';

  return (
    <main className="flex flex-col gap-4 px-5 py-6 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: '/' })} className="text-sm text-zinc-500">
          ← {t('common.back')}
        </button>
        <h1 className="text-2xl font-bold text-zinc-900">{t('history.title')}</h1>
      </header>

      {rows.length === 0 ? (
        <p className="mt-6 text-center text-zinc-500">{t('history.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ s, total, count }) => (
            <li key={s.id}>
              <button
                onClick={() => navigate({ to: '/compra/$id', params: { id: s.id } })}
                className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 p-4 text-left active:bg-zinc-50"
              >
                <div>
                  <p className="font-medium text-zinc-900">{fmtDate(s.completedAt)}</p>
                  <p className="text-sm text-zinc-500">{t('shopping.itemsBought', { count })}</p>
                </div>
                <span className="font-mono font-semibold text-zinc-900">{fmt(total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
