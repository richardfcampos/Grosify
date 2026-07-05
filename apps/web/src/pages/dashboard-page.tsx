import {
  applyFreeCaps,
  cheapestStore,
  estimateTotal,
  isRecurrenceDue,
  maxLists,
  neededQty,
  type PriceRecord,
} from '@grosify/shared';
import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  db,
  type LocalItem,
  type LocalList,
  type LocalSession,
  type LocalSessionItem,
} from '../db/dexie.js';
import {
  Badge,
  Button,
  Icon,
  MoneyValue,
  PriceTag,
  SectionTitle,
  useMoneyParts,
} from '../features/ui/index.js';
import { HouseholdSwitcher } from '../features/catalog/household-switcher.js';
import { HiddenDataBanner } from '../features/billing/hidden-data-banner.js';
import { useSession } from '../lib/auth-client.js';
import { useFormatMoney, useHouseholdPlan } from '../lib/use-currency.js';
import { useMembership } from '../lib/use-membership.js';
import { Loading } from './household-pages.js';

/**
 * Home = reposição por lista recorrente: cada lista mostra o que falta comprar
 * (qty recomendada da entrada − estoque) e total estimado. No topo, o "preço
 * protagonista": quanto a casa economizou no mês (estimado − pago nas compras
 * concluídas) — só aparece quando há economia real.
 */
export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormatMoney();
  const money = useMoneyParts();
  const { data: session, isPending } = useSession();
  const membership = useMembership(!!session);
  const plan = useHouseholdPlan();
  const [housesOpen, setHousesOpen] = useState(false);

  const allRecurringLists = useLiveQuery(
    () => db.lists.filter((l) => l.deletedAt === null && l.isRecurring).toArray(),
    [],
    [] as LocalList[],
  );
  // Filtro de leitura no downgrade: dentre as recorrentes, só as mais antigas até o
  // teto ficam visíveis no dashboard (mesma regra de listas-page, aplicada aqui ao
  // subconjunto recorrente que a home usa pra reposição).
  const lists = useMemo(
    () => applyFreeCaps(allRecurringLists, maxLists(plan), plan),
    [allRecurringLists, plan],
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
  const items = useLiveQuery(
    () => db.items.filter((i) => i.deletedAt === null).toArray(),
    [],
    [] as LocalItem[],
  );

  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);
  const onHand = useMemo(() => new Map(inventory.map((i) => [i.itemId, i.qtyOnHand])), [inventory]);
  const priceOf = useMemo(() => {
    const m = new Map<string, number | null>();
    return (itemId: string) => {
      if (!m.has(itemId))
        m.set(itemId, cheapestStore(prices.filter((p) => p.itemId === itemId))?.priceCents ?? null);
      return m.get(itemId) ?? null;
    };
  }, [prices]);

  // por lista recorrente: itens faltando (recomendado − estoque), quantos sem preço e total estimado
  const perList = useMemo(
    () =>
      lists.map((list) => {
        const listEntries = entries.filter((e) => e.listId === list.id);
        const needed = listEntries
          .map((e) => ({ itemId: e.itemId, need: neededQty(e.qty, onHand.get(e.itemId) ?? 0) }))
          .filter((x) => x.need > 0);
        const noPrice = needed.filter((n) => priceOf(n.itemId) === null).length;
        const total = estimateTotal(
          needed.map((n) => ({ qty: n.need, unitPriceCents: priceOf(n.itemId) })),
        ).totalCents;
        const due = isRecurrenceDue(list.recurrence, list.recurrenceDay, new Date());
        return { list, missing: needed.length, noPrice, total, due };
      }),
    [lists, entries, onHand, priceOf],
  );

  // resumo do mês: economia (estimado − pago), quantas compras vieram abaixo do
  // estimado e o item de melhor negócio (maior economia numa linha). Tudo das
  // sessões concluídas deste mês.
  const monthSummary = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${now.getMonth()}`;
    const monthSessions = new Set(
      sessions
        .filter((s) => {
          if (!s.completedAt) return false;
          const d = new Date(s.completedAt);
          return `${d.getFullYear()}-${d.getMonth()}` === ym;
        })
        .map((s) => s.id),
    );
    let saved = 0;
    let bestDeal = { name: '', saved: 0 };
    const perSession = new Map<string, { est: number; act: number }>();
    for (const si of sessionItems) {
      if (!monthSessions.has(si.sessionId)) continue;
      if (si.estimatedUnitPriceCents == null || si.actualUnitPriceCents == null || si.actualQty == null)
        continue;
      const q = Number(si.actualQty);
      const lineSaved = Math.round((si.estimatedUnitPriceCents - si.actualUnitPriceCents) * q);
      saved += lineSaved;
      const agg = perSession.get(si.sessionId) ?? { est: 0, act: 0 };
      agg.est += si.estimatedUnitPriceCents * q;
      agg.act += si.actualUnitPriceCents * q;
      perSession.set(si.sessionId, agg);
      if (lineSaved > bestDeal.saved) bestDeal = { name: itemName.get(si.itemId) ?? '', saved: lineSaved };
    }
    let under = 0;
    for (const v of perSession.values()) if (v.act < v.est) under++;
    return { saved, under, total: perSession.size, bestDeal };
  }, [sessions, sessionItems, itemName]);
  const savedThisMonth = monthSummary.saved;

  const monthLabel = new Date().toLocaleDateString(i18n.resolvedLanguage, { month: 'long' });
  // lista alvo do "Iniciar compra": a do dia com pendência, senão a primeira pendente, senão a primeira
  const target =
    perList.find((p) => p.due && p.missing > 0) ??
    perList.find((p) => p.missing > 0) ??
    perList[0];

  if (isPending || (session && membership.isLoading)) return <Loading />;
  if (!session) return <Navigate to="/entrar" search={{ redirect: '/' }} />;
  if (!membership.data) return <Navigate to="/casa" />;

  return (
    <main className="screen-in flex flex-col gap-5 px-[18px] py-6">
      <header className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => setHousesOpen(true)}
          aria-label={t('household.yourHouses')}
          className="-m-1 flex items-center gap-2.5 rounded-lg p-1"
        >
          <img src="/icon.svg" alt="" className="h-[30px] w-[30px] flex-none" />
          <span className="text-[17px] font-bold tracking-tight">{membership.data.name}</span>
          <Icon name="chev" size={18} className="text-[var(--app-gray)]" />
        </button>
        <div className="flex-1" />
        <Link to="/historico" aria-label={t('history.title')} className="flex p-1 text-[var(--app-gray)]">
          <Icon name="clock" size={22} />
        </Link>
        <Link to="/ajustes" aria-label={t('settings.title')} className="flex p-1 text-[var(--app-gray)]">
          <Icon name="gear" size={22} />
        </Link>
      </header>

      <HiddenDataBanner />

      {savedThisMonth > 0 && (
        <div className="card overflow-hidden p-[26px]">
          <div className="kicker">{t('restock.savedIn', { month: monthLabel })}</div>
          <div className="mt-2">
            <MoneyValue cents={savedThisMonth} size="lg" tone="positive" {...money} />
          </div>
          {monthSummary.total > 0 && (
            <div className="mt-[18px] flex flex-wrap gap-4">
              <Stat
                label={t('restock.belowEstimate')}
                value={t('restock.belowEstimateValue', {
                  under: monthSummary.under,
                  total: monthSummary.total,
                })}
              />
              {monthSummary.bestDeal.name && (
                <Stat label={t('restock.bestPrice')} value={monthSummary.bestDeal.name} tag />
              )}
            </div>
          )}
        </div>
      )}

      <SectionTitle title={t('restock.title')} sub={t('restock.subtitle')} />

      {lists.length === 0 ? (
        <p className="muted mt-2 text-center text-sm">{t('restock.noLists')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {perList.map(({ list, missing, noPrice, total, due }) => (
            <Link
              key={list.id}
              to="/listas/$id"
              params={{ id: list.id }}
              className="card tap flex items-center gap-3.5 p-4"
            >
              {list.icon && (
                <span className="flex-none text-[26px] leading-none">{list.icon}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-base font-semibold">{list.name}</span>
                  {due && (
                    <Badge tone="oferta" style={{ fontSize: 10 }}>
                      {t('restock.dueToday')}
                    </Badge>
                  )}
                </div>
                <div className="muted mt-0.5 text-[13px]">
                  {missing > 0 ? t('restock.missingCount', { count: missing }) : t('restock.nothing')}
                  {noPrice > 0 && ` · ${t('restock.noPrice', { count: noPrice })}`}
                </div>
              </div>
              <div className="text-right">
                <div className="kicker muted mb-0.5">{t('restock.estimated')}</div>
                <div className="mono text-[15px] font-semibold">{fmt(total)}</div>
              </div>
              <Icon name="chev" size={18} className="flex-none text-[var(--app-gray)]" />
            </Link>
          ))}
        </div>
      )}

      {lists.length > 0 && (
        <div className="flex gap-2.5">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!target || target.missing === 0}
            onClick={() =>
              target &&
              navigate({ to: '/listas/$id/comprar', params: { id: target.list.id } })
            }
          >
            {t('restock.startShopping')}
          </Button>
          <Link
            to="/inventario"
            className="gro-btn gro-btn--secondary gro-btn--lg flex-none"
            style={{ whiteSpace: 'nowrap' }}
          >
            {t('restock.doInventory')}
          </Link>
        </div>
      )}

      {housesOpen && (
        <div className="gro-sheet-backdrop" onClick={() => setHousesOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="gro-sheet-panel flex flex-col gap-4">
            <div className="gro-sheet-grip" />
            <div className="kicker">{t('household.yourHouses')}</div>
            <HouseholdSwitcher />
            <button onClick={() => setHousesOpen(false)} className="muted self-center text-sm">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/** Mini-estatística do hero: rótulo + valor. `tag` rende o valor como etiqueta amarela (oferta). */
function Stat({ label, value, tag }: { label: string; value: string; tag?: boolean }) {
  return (
    <div>
      <div className="kicker">{label}</div>
      {tag ? (
        <div className="mt-1.5">
          <PriceTag>{value}</PriceTag>
        </div>
      ) : (
        <div className="mt-1 text-[15px] font-semibold">{value}</div>
      )}
    </div>
  );
}
