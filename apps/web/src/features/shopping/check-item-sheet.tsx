import { cheapestStore, parseToMinorUnits, priceChange, type PriceRecord } from '@grosify/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalSessionItem } from '../../db/dexie.js';
import { checkSessionItem } from '../../db/repositories.js';
import { useFormatMoney, useHouseholdCurrency } from '../../lib/use-currency.js';

interface Props {
  sessionItem: LocalSessionItem;
  itemName: string;
  onClose: () => void;
}

/** Folha escura pra marcar item comprado: loja, qtd, preço pago, com avisos. */
export function CheckItemSheet({ sessionItem, itemName, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const fmt = useFormatMoney();
  const currency = useHouseholdCurrency();

  const stores = useLiveQuery(() => db.stores.filter((s) => s.deletedAt === null).toArray(), [], []);
  const prices = useLiveQuery(
    () =>
      db.prices
        .where('itemId')
        .equals(sessionItem.itemId)
        .filter((p) => p.deletedAt === null)
        .toArray(),
    [sessionItem.itemId],
    [] as PriceRecord[],
  );

  const [storeId, setStoreId] = useState(sessionItem.estimatedPriceStoreId ?? '');
  const [qty, setQty] = useState(String(sessionItem.neededQty || 1));
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const cheapest = useMemo(() => cheapestStore(prices), [prices]);
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? '—';
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.resolvedLanguage);

  const warn = useMemo(() => {
    if (!storeId || !value) return null;
    try {
      const change = priceChange(parseToMinorUnits(value, currency), storeId, prices);
      return change && change.deltaCents > 0
        ? t('shopping.priceUpWarn') + ` (+${fmt(change.deltaCents)})`
        : null;
    } catch {
      return null;
    }
  }, [storeId, value, prices, currency, fmt, t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await checkSessionItem(
        sessionItem.id,
        sessionItem.itemId,
        storeId,
        Number(qty.replace(',', '.')),
        parseToMinorUnits(value, currency),
      );
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'min-h-12 w-full rounded-xl border border-stone-700 bg-stone-900 px-4 py-3 text-base text-stone-50 outline-none focus:border-yellow-400';

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-t-3xl bg-stone-950 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-stone-50"
      >
        <h2 className="text-lg font-bold">{itemName}</h2>

        {cheapest && cheapest.storeId !== storeId && (
          <div className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-stone-900">
            {t('shopping.cheaperElsewhere', { store: storeName(cheapest.storeId) })}: {fmt(cheapest.priceCents)}{' '}
            <span className="font-normal">({fmtDate(cheapest.recordedAt)})</span>
          </div>
        )}

        {stores.length === 0 ? (
          <p className="text-sm text-amber-400">{t('prices.noStores')}</p>
        ) : (
          <>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} required className={inputClass}>
              <option value="" disabled>
                {t('prices.selectStore')}
              </option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <label className="flex w-24 flex-col gap-1">
                <span className="text-xs text-stone-400">{t('shopping.actualQty')}</span>
                <input
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ''))}
                  inputMode="decimal"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-stone-400">{t('shopping.actualPrice')}</span>
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  inputMode="decimal"
                  required
                  className={inputClass}
                />
              </label>
            </div>
            {warn && <p className="text-sm font-medium text-red-400">▲ {warn}</p>}
            <button
              type="submit"
              disabled={busy || !storeId || !value}
              className="min-h-12 rounded-xl bg-yellow-400 px-4 py-3 font-bold text-stone-900 disabled:opacity-40"
            >
              {busy ? t('common.saving') : t('shopping.confirm')}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
