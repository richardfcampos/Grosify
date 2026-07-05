import { formatCurrency, PLAN_PRICES } from '@grosify/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/index.js';

/** Mapeia erro HTTP do checkout pro código de tradução (mesmo padrão inline vermelho :312-316). */
export function checkoutErrorKey(status: number, body: { error?: string }): string {
  if (status === 501) return 'billing.unavailable';
  if (status === 502) return 'errors.provider_error';
  if (status === 409) return 'errors.already_subscribed';
  return body.error ? `errors.${body.error}` : 'errors.generic';
}

/** Preço formatado por ciclo, na moeda da casa — null se a moeda não tem preço configurado. */
function priceLabel(currency: string, cycle: 'monthly' | 'yearly', locale: string): string | null {
  const table = (PLAN_PRICES as Record<string, Record<string, number>>)[currency];
  const cents = table?.[cycle];
  return typeof cents === 'number' ? formatCurrency(cents, locale, currency) : null;
}

interface Props {
  currency: string;
  locale: string;
  pending: boolean;
  error: string | null;
  onSubmit: (cycle: 'monthly' | 'yearly', cpfCnpj: string) => void;
}

/** Comparativo + campo CPF/CNPJ + botões mensal/anual — bloco free do PlanSection. */
export function PlanCheckoutForm({ currency, locale, pending, error, onSubmit }: Props) {
  const { t } = useTranslation();
  const [cpfCnpj, setCpfCnpj] = useState('');

  const monthlyLabel = priceLabel(currency, 'monthly', locale);
  const yearlyLabel = priceLabel(currency, 'yearly', locale);
  const cpfValid = cpfCnpj.trim().length >= 11 && cpfCnpj.trim().length <= 18;

  function submit(e: FormEvent, cycle: 'monthly' | 'yearly') {
    e.preventDefault();
    onSubmit(cycle, cpfCnpj);
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-3">
      <p className="muted text-sm">{t('billing.proPitchFull')}</p>
      <ul className="muted flex flex-col gap-1 text-sm">
        <li>• {t('billing.benefitItems')}</li>
        <li>• {t('billing.benefitLists')}</li>
        <li>• {t('billing.benefitMembers')}</li>
        <li>• {t('billing.benefitHistory')}</li>
        <li>• {t('billing.benefitPhotos')}</li>
        <li>• {t('billing.benefitAnalytics')}</li>
        <li>• {t('billing.benefitExport')}</li>
      </ul>

      <label className="flex flex-col gap-1">
        <span className="kicker">{t('billing.cpfLabel')}</span>
        <input
          value={cpfCnpj}
          onChange={(e) => setCpfCnpj(e.target.value.replace(/[^\d]/g, ''))}
          inputMode="numeric"
          placeholder={t('billing.cpfLabel')}
          className="gro-field gro-field--mono"
        />
        <span className="muted text-xs">{t('billing.cpfHint')}</span>
      </label>

      <div className="flex gap-2.5">
        <Button
          variant="primary"
          size="md"
          fullWidth
          disabled={!cpfValid || pending}
          onClick={(e) => submit(e, 'monthly')}
        >
          {t('billing.subscribeMonthly')}
          {monthlyLabel ? ` · ${monthlyLabel}${t('billing.perMonth')}` : ''}
        </Button>
        <Button
          variant="secondary"
          size="md"
          fullWidth
          disabled={!cpfValid || pending}
          onClick={(e) => submit(e, 'yearly')}
        >
          {t('billing.subscribeYearly')}
          {yearlyLabel ? ` · ${yearlyLabel}${t('billing.perYear')}` : ''}
        </Button>
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
          {error}
        </p>
      )}
    </form>
  );
}
