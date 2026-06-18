import {
  cheapestStore,
  estimateTotal,
  isRecurrenceDue,
  neededQty,
  type PriceRecord,
} from '@grosify/shared';
import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalList } from '../db/dexie.js';
import { useSession } from '../lib/auth-client.js';
import { useFormatMoney } from '../lib/use-currency.js';
import { useMembership } from '../lib/use-membership.js';
import { Loading } from './household-pages.js';

/**
 * Home = reposição por lista recorrente: cada lista mostra o que falta comprar
 * (qty recomendada da entrada − estoque) e total estimado.
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormatMoney();
  const { data: session, isPending } = useSession();
  const membership = useMembership(!!session);

  const lists = useLiveQuery(
    () => db.lists.filter((l) => l.deletedAt === null && l.isRecurring).toArray(),
    [],
    [] as LocalList[],
  );
  const entries = useLiveQuery(
    () => db.listEntries.filter((e) => e.deletedAt === null).toArray(),
    [],
    [],
  );
  const inventory = useLiveQuery(
    () => db.inventory.filter((i) => i.deletedAt === null).toArray(),
    [],
    [],
  );
  const prices = useLiveQuery(
    () => db.prices.filter((p) => p.deletedAt === null).toArray(),
    [],
    [] as PriceRecord[],
  );

  const onHand = useMemo(() => new Map(inventory.map((i) => [i.itemId, i.qtyOnHand])), [inventory]);
  const priceOf = useMemo(() => {
    const m = new Map<string, number | null>();
    return (itemId: string) => {
      if (!m.has(itemId))
        m.set(itemId, cheapestStore(prices.filter((p) => p.itemId === itemId))?.priceCents ?? null);
      return m.get(itemId) ?? null;
    };
  }, [prices]);

  // por lista recorrente: itens faltando (recomendado − estoque) + total estimado
  const perList = useMemo(
    () =>
      lists.map((list) => {
        const listEntries = entries.filter((e) => e.listId === list.id);
        const needed = listEntries
          .map((e) => ({ itemId: e.itemId, need: neededQty(e.qty, onHand.get(e.itemId) ?? 0) }))
          .filter((x) => x.need > 0);
        const total = estimateTotal(
          needed.map((n) => ({ qty: n.need, unitPriceCents: priceOf(n.itemId) })),
        ).totalCents;
        return { list, missing: needed.length, total };
      }),
    [lists, entries, onHand, priceOf],
  );

  if (isPending || (session && membership.isLoading)) return <Loading />;
  if (!session) return <Navigate to="/entrar" search={{ redirect: '/' }} />;
  if (!membership.data) return <Navigate to="/casa" />;

  return (
    <main className="flex flex-col gap-5 px-5 py-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <h1 className="text-lg font-bold text-zinc-900">{membership.data.name}</h1>
        </div>
        <Link to="/ajustes" aria-label={t('settings.title')} className="text-2xl text-zinc-500">
          ⚙
        </Link>
      </header>

      <div>
        <h2 className="text-xs uppercase tracking-wide text-zinc-500">{t('restock.title')}</h2>
        <p className="text-sm text-zinc-500">{t('restock.subtitle')}</p>
      </div>

      <Link
        to="/inventario"
        className="rounded-xl border border-green-600 px-4 py-2.5 text-center text-sm font-semibold text-green-700"
      >
        {t('restock.doInventory')}
      </Link>

      {lists.length === 0 ? (
        <p className="mt-4 text-center text-sm text-zinc-500">{t('restock.noLists')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {perList.map(({ list, missing, total }) => (
            <li key={list.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4">
              <div className="flex items-start justify-between">
                <Link to="/listas/$id" params={{ id: list.id }} className="min-w-0">
                  <p className="truncate font-semibold text-zinc-900">
                    {list.icon ? `${list.icon} ` : ''}
                    {list.name}
                  </p>
                  {isRecurrenceDue(list.recurrence, list.recurrenceDay, new Date()) && (
                    <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      {t('restock.dueToday')}
                    </span>
                  )}
                  <p className="text-sm text-zinc-500">
                    {missing > 0
                      ? t('restock.missingCount', { count: missing })
                      : t('restock.nothing')}
                  </p>
                </Link>
                <span className="font-bold text-zinc-900">{fmt(total)}</span>
              </div>
              {missing > 0 && (
                <button
                  onClick={() => navigate({ to: '/listas/$id/comprar', params: { id: list.id } })}
                  className="min-h-11 rounded-xl bg-green-600 text-sm font-bold text-white active:bg-green-700"
                >
                  {t('restock.startShopping')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
