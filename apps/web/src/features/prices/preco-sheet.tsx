import { cheapestStore, historyCutoff, parseToMinorUnits, priceChange } from '@grosify/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/dexie.js';
import { recordPrice } from '../../db/repositories.js';
import { BrandPicker } from '../brands/brand-picker.js';
import { useFormatMoney, useHouseholdCurrency, useHouseholdPlan } from '../../lib/use-currency.js';

interface Props {
  itemId: string;
  itemName: string;
  onClose: () => void;
}

/** Registrar preço de um item: loja + valor, com alerta de aumento, histórico e loja mais barata. */
export function PrecoSheet({ itemId, itemName, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const fmt = useFormatMoney();
  const currency = useHouseholdCurrency();
  const plan = useHouseholdPlan();

  const stores = useLiveQuery(() => db.stores.filter((s) => s.deletedAt === null).toArray(), [], []);
  const allPrices = useLiveQuery(
    () =>
      db.prices.where('itemId').equals(itemId).filter((p) => p.deletedAt === null).toArray(),
    [itemId],
    [],
  );

  // Plano free: histórico limitado aos últimos 90 dias.
  const prices = useMemo(() => {
    const cutoff = historyCutoff(plan, new Date());
    if (!cutoff) return allPrices;
    const iso = cutoff.toISOString();
    return allPrices.filter((p) => p.recordedAt >= iso);
  }, [allPrices, plan]);

  const brands = useLiveQuery(
    () => db.brands.where('itemId').equals(itemId).filter((b) => b.deletedAt === null).toArray(),
    [itemId],
    [],
  );

  const [storeId, setStoreId] = useState('');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const cheapest = useMemo(() => cheapestStore(prices), [prices]);
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? '—';
  const brandName = (id: string | null) => (id ? brands.find((b) => b.id === id)?.name ?? null : null);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.resolvedLanguage);

  const alert = useMemo(() => {
    if (!storeId || !value) return null;
    try {
      const cents = parseToMinorUnits(value, currency);
      const change = priceChange(cents, storeId, brandId, prices);
      if (!change || change.deltaCents === 0) return null;
      const key = change.deltaCents > 0 ? 'prices.priceUp' : 'prices.priceDown';
      return {
        up: change.deltaCents > 0,
        text: t(key, {
          delta: fmt(Math.abs(change.deltaCents)),
          pct: Math.abs(change.deltaPct),
          date: fmtDate(change.previousRecordedAt),
        }),
      };
    } catch {
      return null;
    }
  }, [storeId, value, brandId, prices, currency, fmt, t, i18n.resolvedLanguage]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await recordPrice(itemId, storeId, parseToMinorUnits(value, currency), brandId);
      setValue('');
    } finally {
      setBusy(false);
    }
  }

  const history = [...prices].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[85dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900">{itemName}</h2>
          <button onClick={onClose} className="text-sm text-zinc-500">
            {t('common.cancel')}
          </button>
        </div>

        {cheapest && (
          <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            {t('prices.cheapestAt', {
              price: fmt(cheapest.priceCents),
              store: storeName(cheapest.storeId),
            })}
            {brandName(cheapest.brandId) ? ` · ${brandName(cheapest.brandId)}` : ''}{' '}
            <span className="text-green-600">{t('prices.seenOn', { date: fmtDate(cheapest.recordedAt) })}</span>
          </div>
        )}

        {stores.length === 0 ? (
          <p className="text-sm text-amber-700">{t('prices.noStores')}</p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              required
              className="min-h-12 rounded-xl border border-zinc-300 px-4 py-3 text-base"
            >
              <option value="" disabled>
                {t('prices.selectStore')}
              </option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <BrandPicker itemId={itemId} value={brandId} onChange={setBrandId} />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              required
              placeholder={t('prices.price')}
              className="min-h-12 rounded-xl border border-zinc-300 px-4 py-3 text-base"
            />
            {alert && (
              <p className={`text-sm font-medium ${alert.up ? 'text-red-600' : 'text-green-700'}`}>
                {alert.up ? '▲' : '▼'} {alert.text}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !storeId || !value}
              className="min-h-12 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white active:bg-green-700 disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('prices.record')}
            </button>
          </form>
        )}

        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold text-zinc-600">{t('prices.history')}</h3>
          {history.length === 0 ? (
            <p className="text-sm text-zinc-400">{t('prices.noPrices')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {history.map((p) => (
                <li key={p.id} className="flex justify-between text-sm">
                  <span className="text-zinc-600">
                    {storeName(p.storeId)}
                    {brandName(p.brandId) ? ` · ${brandName(p.brandId)}` : ''} · {fmtDate(p.recordedAt)}
                  </span>
                  <span className="font-mono font-medium text-zinc-900">{fmt(p.priceCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
