import {
  averagePrice,
  baseUnitFor,
  cheapestStore,
  convertUnit,
  historyCutoff,
  parseToMinorUnits,
  priceChange,
  PRICE_ALERT_THRESHOLD_PCT,
} from '@grosify/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../../db/dexie.js';
import { recordPrice } from '../../db/repositories.js';
import { BrandPicker } from '../brands/brand-picker.js';
import { PriceScanModal } from '../scanner/price-scan-modal.js';
import { StarRating } from './star-rating.js';
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
  const item = useLiveQuery(() => db.items.get(itemId), [itemId]);
  // preço normalizado por kg/L quando o item é vendido em g/ml
  const baseUnit = item ? baseUnitFor(item.unit) : null;
  const perBase = (cents: number): string | null => {
    if (!item || !baseUnit) return null;
    const factor = convertUnit(1, baseUnit, item.unit); // ex.: 1 kg = 1000 g
    return factor ? `${fmt(Math.round(cents * factor))}/${t(`catalog.units.${baseUnit}`)}` : null;
  };

  const [storeId, setStoreId] = useState('');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [priceScan, setPriceScan] = useState(false);
  const [busy, setBusy] = useState(false);

  const cheapest = useMemo(() => cheapestStore(prices), [prices]);
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? '—';
  const brandName = (id: string | null) => (id ? brands.find((b) => b.id === id)?.name ?? null : null);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.resolvedLanguage);

  // média dos últimos 90 dias (mesmo item) — contexto além do "vs última compra"
  const avg3m = useMemo(
    () => averagePrice(prices, new Date(Date.now() - 90 * 86_400_000).toISOString()),
    [prices],
  );

  const alert = useMemo(() => {
    if (!storeId || !value) return null;
    try {
      const cents = parseToMinorUnits(value, currency);
      const change = priceChange(cents, storeId, brandId, prices);
      // só alerta variações relevantes (≥ limite) vs última compra na mesma loja+marca
      if (!change || Math.abs(change.deltaPct) < PRICE_ALERT_THRESHOLD_PCT) return null;
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
      await recordPrice(itemId, storeId, parseToMinorUnits(value, currency), brandId, rating);
      setValue('');
      setRating(null);
    } finally {
      setBusy(false);
    }
  }

  const history = [...prices].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 8);
  // série pro gráfico (ordem cronológica)
  const chart = [...prices]
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((p) => ({ t: fmtDate(p.recordedAt), price: p.priceCents }));

  return (
    <>
      {priceScan && (
        <PriceScanModal onDetect={(p) => setValue(p)} onClose={() => setPriceScan(false)} />
      )}
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
            {perBase(cheapest.priceCents) && (
              <span className="ml-1 text-green-600">≈ {perBase(cheapest.priceCents)}</span>
            )}
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
            <div className="flex gap-2">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                required
                placeholder={t('prices.price')}
                className="min-h-12 flex-1 rounded-xl border border-zinc-300 px-4 py-3 text-base"
              />
              <button
                type="button"
                onClick={() => setPriceScan(true)}
                aria-label={t('priceScan.scan')}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-xl"
              >
                📷
              </button>
            </div>
            {alert && (
              <p className={`text-sm font-medium ${alert.up ? 'text-red-600' : 'text-green-700'}`}>
                {alert.up ? '▲' : '▼'} {alert.text}
              </p>
            )}
            {avg3m != null && (
              <p className="text-xs text-zinc-500">{t('prices.avg3m', { price: fmt(avg3m) })}</p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">{t('prices.rating')}</span>
              <StarRating value={rating} onChange={setRating} />
            </div>
            <button
              type="submit"
              disabled={busy || !storeId || !value}
              className="min-h-12 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white active:bg-green-700 disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('prices.record')}
            </button>
          </form>
        )}

        {chart.length >= 2 && (
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => fmt(Number(v))} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Line type="monotone" dataKey="price" stroke="#15803D" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
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
                  <span className="font-mono font-medium text-zinc-900">
                    {fmt(p.priceCents)}
                    {p.rating ? <span className="ml-1 text-amber-500">{'★'.repeat(p.rating)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
