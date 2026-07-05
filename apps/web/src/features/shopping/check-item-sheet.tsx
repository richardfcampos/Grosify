import {
  cheapestStore,
  historyCutoff,
  parseToMinorUnits,
  priceChange,
  PRICE_ALERT_THRESHOLD_PCT,
  type PriceRecord,
} from '@grosify/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalSessionItem } from '../../db/dexie.js';
import { checkSessionItem } from '../../db/repositories.js';
import { BrandPicker } from '../brands/brand-picker.js';
import { PriceScanModal } from '../scanner/price-scan-modal.js';
import { StarRating } from '../prices/star-rating.js';
import { Button, SearchSelect } from '../ui/index.js';
import { useFormatMoney, useHouseholdCurrency, useHouseholdPlan } from '../../lib/use-currency.js';

interface Props {
  sessionItem: LocalSessionItem;
  itemName: string;
  /** Marca já resolvida pelo código de barras escaneado (pré-seleciona). */
  initialBrandId?: string | null;
  /** Loja ativa da sessão (pré-preenche; evita re-selecionar a cada item). */
  initialStoreId?: string | null;
  /** Avisa a loja escolhida ao confirmar (gruda como ativa para os próximos). */
  onStoreConfirmed?: (storeId: string) => void;
  onClose: () => void;
}

/** Folha escura pra marcar item comprado: loja, marca, qtd, preço pago, com avisos. */
export function CheckItemSheet({
  sessionItem,
  itemName,
  initialBrandId,
  initialStoreId,
  onStoreConfirmed,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation();
  const fmt = useFormatMoney();
  const currency = useHouseholdCurrency();
  const plan = useHouseholdPlan();

  const stores = useLiveQuery(() => db.stores.filter((s) => s.deletedAt === null).toArray(), [], []);
  const brands = useLiveQuery(
    () => db.brands.where('itemId').equals(sessionItem.itemId).filter((b) => b.deletedAt === null).toArray(),
    [sessionItem.itemId],
    [],
  );
  const allPrices = useLiveQuery(
    () =>
      db.prices
        .where('itemId')
        .equals(sessionItem.itemId)
        .filter((p) => p.deletedAt === null)
        .toArray(),
    [sessionItem.itemId],
    [] as PriceRecord[],
  );
  // Plano free: histórico limitado aos últimos 90 dias (mesma regra do preco-sheet).
  const prices = useMemo(() => {
    const cutoff = historyCutoff(plan, new Date());
    if (!cutoff) return allPrices;
    const iso = cutoff.toISOString();
    return allPrices.filter((p) => p.recordedAt >= iso);
  }, [allPrices, plan]);

  const [storeId, setStoreId] = useState(initialStoreId ?? sessionItem.estimatedPriceStoreId ?? '');
  const [brandId, setBrandId] = useState<string | null>(initialBrandId ?? sessionItem.actualBrandId ?? null);
  const [qty, setQty] = useState(String(sessionItem.neededQty || 1));
  const [value, setValue] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [priceScan, setPriceScan] = useState(false);
  const [busy, setBusy] = useState(false);

  const cheapest = useMemo(() => cheapestStore(prices), [prices]);
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? '—';
  const brandName = (id: string | null) => (id ? brands.find((b) => b.id === id)?.name ?? null : null);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.resolvedLanguage);

  const warn = useMemo(() => {
    if (!storeId || !value) return null;
    try {
      const change = priceChange(parseToMinorUnits(value, currency), storeId, brandId, prices);
      return change && change.deltaPct >= PRICE_ALERT_THRESHOLD_PCT
        ? t('shopping.priceUpWarn') + ` (+${fmt(change.deltaCents)})`
        : null;
    } catch {
      return null;
    }
  }, [storeId, value, brandId, prices, currency, fmt, t]);

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
        brandId,
        rating,
      );
      if (storeId && storeId !== initialStoreId) onStoreConfirmed?.(storeId);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {priceScan && (
        <PriceScanModal onDetect={(p) => setValue(p)} onClose={() => setPriceScan(false)} />
      )}
      <div className="gro-sheet-backdrop" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="gro-sheet-panel flex flex-col gap-3"
      >
        <div className="gro-sheet-grip" />
        <h2 className="text-lg font-bold">{itemName}</h2>

        {cheapest && cheapest.storeId !== storeId && (
          <div
            className="rounded-xl px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--gro-yellow)', color: '#1c1917' }}
          >
            {t('shopping.cheaperElsewhere', { store: storeName(cheapest.storeId) })}: {fmt(cheapest.priceCents)}
            {brandName(cheapest.brandId) ? ` · ${brandName(cheapest.brandId)}` : ''}{' '}
            <span className="font-normal">({fmtDate(cheapest.recordedAt)})</span>
          </div>
        )}

        {stores.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--gro-yellow)' }}>{t('prices.noStores')}</p>
        ) : (
          <>
            <SearchSelect
              value={storeId}
              options={stores.map((s) => ({ value: s.id, label: s.name }))}
              placeholder={t('prices.selectStore')}
              searchPlaceholder={t('prices.searchStore')}
              onChange={setStoreId}
            />
            <label className="flex flex-col gap-1">
              <span className="kicker">{t('brands.label')}</span>
              <BrandPicker itemId={sessionItem.itemId} value={brandId} onChange={setBrandId} />
            </label>
            <div className="flex gap-2">
              <label className="flex w-24 flex-col gap-1">
                <span className="kicker">{t('shopping.actualQty')}</span>
                <input
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ''))}
                  inputMode="decimal"
                  className="gro-field gro-field--mono"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="kicker">{t('shopping.actualPrice')}</span>
                <div className="flex gap-2">
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    inputMode="decimal"
                    required
                    className="gro-field gro-field--mono"
                  />
                  <button
                    type="button"
                    onClick={() => setPriceScan(true)}
                    aria-label={t('priceScan.scan')}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl"
                    style={{ background: 'var(--app-surface-2)' }}
                  >
                    📷
                  </button>
                </div>
              </label>
            </div>
            {warn && (
              <p className="text-sm font-medium" style={{ color: 'var(--gro-red)' }}>
                ▲ {warn}
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="kicker">{t('prices.rating')}</span>
              <StarRating value={rating} onChange={setRating} dark />
            </div>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              type="submit"
              disabled={busy || !storeId || !value}
            >
              {busy ? t('common.saving') : t('shopping.confirm')}
            </Button>
          </>
        )}
      </form>
    </div>
    </>
  );
}
