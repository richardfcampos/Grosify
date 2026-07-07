import { formatCurrency, PLAN_PRICES } from '@grosify/shared';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useHouseholdCurrency } from '../../lib/use-currency.js';
import { Button } from '../ui/index.js';

export type PaywallFeature = 'photos' | 'analytics' | 'export' | 'nfce' | 'nlList' | 'forecast';

interface Props {
  feature: PaywallFeature;
  onClose: () => void;
}

/** Preço mensal formatado na moeda da casa; null se a moeda não tem preço configurado. */
function monthlyPriceLabel(currency: string, locale: string): string | null {
  const table = (PLAN_PRICES as Record<string, Record<string, number>>)[currency];
  const cents = table?.monthly;
  return typeof cents === 'number' ? formatCurrency(cents, locale, currency) : null;
}

/**
 * Sheet reutilizável de paywall Pro: bloqueia um recurso free (fotos, analytics,
 * export) com pitch curto + preço + CTA pra Ajustes, onde o checkout de verdade
 * acontece (PlanSection). Mesma casca visual do preco-sheet (gro-sheet-*).
 */
export function PaywallSheet({ feature, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const currency = useHouseholdCurrency();
  const price = monthlyPriceLabel(currency, i18n.resolvedLanguage ?? 'pt');

  const pitchKey =
    feature === 'photos'
      ? 'billing.photoPaywallPitch'
      : feature === 'analytics'
        ? 'billing.analyticsPaywallPitch'
        : feature === 'nfce'
          ? 'billing.nfcePaywallPitch'
          : feature === 'nlList'
            ? 'billing.nlListPaywallPitch'
            : feature === 'forecast'
              ? 'billing.forecastPaywallPitch'
              : 'billing.exportPaywallPitch';

  return (
    <div className="gro-sheet-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="gro-sheet-panel flex flex-col gap-4">
        <div className="gro-sheet-grip" />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('billing.paywallTitle')}</h2>
          <button onClick={onClose} className="muted text-sm">
            {t('common.cancel')}
          </button>
        </div>

        <p className="text-sm">{t(pitchKey)}</p>

        {price && (
          <p className="muted text-xs">
            {t('billing.subscribeMonthly')} · {price}
            {t('billing.perMonth')}
          </p>
        )}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={() => {
            onClose();
            navigate({ to: '/ajustes' });
          }}
        >
          {t('billing.paywallCta')}
        </Button>
      </div>
    </div>
  );
}
