import { formatCurrency } from '@grosify/shared';
import { useTranslation } from 'react-i18next';
import { useSession } from './auth-client.js';
import { useMembership } from './use-membership.js';

/** Código ISO 4217 da moeda da casa. */
export function useHouseholdCurrency(): string {
  const { data: session } = useSession();
  const membership = useMembership(!!session);
  return membership.data?.currency ?? 'BRL';
}

/** Formatador de moeda da casa, no locale da UI. */
export function useFormatMoney(): (minorUnits: number) => string {
  const { i18n } = useTranslation();
  const currency = useHouseholdCurrency();
  const locale = i18n.resolvedLanguage ?? 'pt';
  return (minorUnits: number) => formatCurrency(minorUnits, locale, currency);
}
