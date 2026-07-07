import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaywallSheet } from '../billing/paywall-sheet.js';
import type { PriceInsights } from '../../lib/use-price-insights.js';

interface Props {
  plan: 'free' | 'pro';
  insights: PriceInsights;
  fmt: (cents: number) => string;
  storeName: (id: string) => string;
  brandName: (id: string | null) => string | null;
}

/** Cor/ícone do card do veredito. Verde/vermelho permitido: é evento de preço (DESIGN.md). */
const VERDICT_STYLE = {
  buy: { cls: 'bg-green-50 text-green-800', icon: '✓' },
  wait: { cls: 'bg-red-50 text-red-700', icon: '⏳' },
  neutral: { cls: '', icon: '≈' },
} as const;

/**
 * Insights de preço no detalhe do item. Pro → card do veredito compre/espere +
 * linha de troca de marca quando existe. Free → teaser de 1 linha que abre o
 * PaywallSheet('priceInsights'). O gate de cálculo vive em `buildPriceInsights`
 * (free chega aqui com ambos `null`), então este componente só renderiza.
 */
export function PriceInsightsSection({ plan, insights, fmt, storeName, brandName }: Props) {
  const { t } = useTranslation();
  const [paywall, setPaywall] = useState(false);

  if (plan !== 'pro') {
    return (
      <>
        <button
          type="button"
          onClick={() => setPaywall(true)}
          className="muted flex items-center gap-1.5 self-start text-[12.5px] font-semibold"
        >
          {t('priceInsights.teaser')}
        </button>
        {paywall && <PaywallSheet feature="priceInsights" onClose={() => setPaywall(false)} />}
      </>
    );
  }

  const { verdict, swap } = insights;
  if (!verdict && !swap) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="kicker">{t('priceInsights.title')}</h3>

      {verdict && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${VERDICT_STYLE[verdict.verdict].cls}`}>
          <span className="mr-1">{VERDICT_STYLE[verdict.verdict].icon}</span>
          {t(`priceInsights.verdict.${verdict.verdict}`, {
            current: fmt(verdict.currentCents),
            avg: fmt(verdict.avgCents),
          })}
        </div>
      )}

      {swap && (
        <p className="text-sm text-green-700">
          {t('priceInsights.swap', {
            cheaper: brandName(swap.cheaperBrandId) ?? t('brands.none'),
            pricier: brandName(swap.pricierBrandId) ?? t('brands.none'),
            pct: swap.savingsPct,
            store: storeName(swap.storeId),
          })}
        </p>
      )}
    </div>
  );
}
