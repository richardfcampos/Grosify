import { cheapestStore, estimateTotal, neededQty, type PriceRecord } from '@grosify/shared';
import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../db/dexie.js';
import { startReplenishmentSession } from '../db/repositories.js';
import { useSession } from '../lib/auth-client.js';
import { useFormatMoney } from '../lib/use-currency.js';
import { useMembership } from '../lib/use-membership.js';
import { Loading } from './household-pages.js';

/** Home = painel de reposição: o que falta comprar (recomendado − estoque). */
export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormatMoney();
  const { data: session, isPending } = useSession();
  const membership = useMembership(!!session);

  const items = useLiveQuery(
    () => db.items.filter((i) => i.deletedAt === null).toArray(),
    [],
    [] as LocalItem[],
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
  const targeted = items.filter((i) => i.monthlyTarget != null);
  const needed = useMemo(
    () =>
      targeted
        .map((item) => ({
          item,
          need: neededQty(item.monthlyTarget ?? 0, onHand.get(item.id) ?? 0),
          price: cheapestStore(prices.filter((p) => p.itemId === item.id))?.priceCents ?? null,
        }))
        .filter((x) => x.need > 0),
    [targeted, onHand, prices],
  );
  const total = useMemo(
    () => estimateTotal(needed.map((n) => ({ qty: n.need, unitPriceCents: n.price }))).totalCents,
    [needed],
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

      <section className="rounded-2xl bg-zinc-900 px-5 py-4 text-white">
        <p className="text-xs uppercase tracking-wide text-zinc-400">{t('restock.title')}</p>
        <p className="text-3xl font-bold">{fmt(total)}</p>
        <p className="mt-1 text-xs text-zinc-400">{t('restock.subtitle')}</p>
      </section>

      <div className="flex gap-2">
        <Link
          to="/inventario"
          className="flex-1 rounded-xl border border-green-600 px-4 py-2.5 text-center text-sm font-semibold text-green-700"
        >
          {t('restock.doInventory')}
        </Link>
        <button
          onClick={async () => {
            const sid = await startReplenishmentSession();
            if (sid) navigate({ to: '/compra/$id', params: { id: sid } });
          }}
          disabled={needed.length === 0}
          className="flex-1 rounded-xl bg-green-600 px-4 py-2.5 text-center text-sm font-bold text-white active:bg-green-700 disabled:opacity-40"
        >
          {t('restock.startShopping')}
        </button>
      </div>

      {targeted.length === 0 ? (
        <p className="mt-4 text-center text-sm text-zinc-500">{t('restock.noTargets')}</p>
      ) : needed.length === 0 ? (
        <p className="mt-4 text-center text-zinc-500">{t('restock.nothing')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {needed.map(({ item, need, price }) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-2xl border border-zinc-200 p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-900">{item.name}</p>
                <p className="text-sm text-zinc-500">
                  {price !== null ? fmt(Math.round(need * price)) : t('lists.missingPrices', { count: 1 })}
                </p>
              </div>
              <span className="font-mono text-sm font-semibold text-green-700">
                {t('restock.toBuy')} {need} {t(`catalog.units.${item.unit}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
