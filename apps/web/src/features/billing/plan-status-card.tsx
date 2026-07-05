import { useTranslation } from 'react-i18next';
import { Button } from '../ui/index.js';

export type SubscriptionStatus = 'pending' | 'active' | 'overdue' | 'canceled';

export interface Subscription {
  status: SubscriptionStatus;
  cycle: 'monthly' | 'yearly';
  currency: string;
  priceCents: number;
  nextDueDate: string | null;
  provider: string;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface Props {
  subscription: Subscription;
  locale: string;
  cancelPending: boolean;
  onCancel: () => void;
}

/** Status/ciclo/próxima cobrança/cancelar — bloco pro com assinatura gerenciada do PlanSection. */
export function PlanStatusCard({ subscription, locale, cancelPending, onCancel }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="muted">{t('billing.cycleLabel', { cycle: t(`billing.${subscription.cycle}`) })}</span>
        <span className="font-semibold">{t(`billing.status${capitalize(subscription.status)}`)}</span>
      </div>
      {subscription.nextDueDate && (
        <p className="muted text-sm">
          {t('billing.nextDueDate', { date: new Date(subscription.nextDueDate).toLocaleDateString(locale) })}
        </p>
      )}
      {subscription.status !== 'canceled' && (
        <Button variant="secondary" size="md" fullWidth onClick={onCancel} disabled={cancelPending}>
          {t('billing.cancelSubscription')}
        </Button>
      )}
    </div>
  );
}
