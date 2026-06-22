import { currencyFractionDigits } from '@grosify/shared';
import { useTranslation } from 'react-i18next';
import { useHouseholdCurrency } from '../../lib/use-currency.js';

/**
 * Símbolo + casas decimais da moeda da casa, no locale da UI — para alimentar
 * `MoneyValue`/`PriceChange` do `@grosify/ui` (que assumem R$/2 casas por padrão).
 * Nunca assumir 2 casas: JPY=0, BHD=3 (via Intl).
 */
export function useMoneyParts(): { symbol: string; decimals: number } {
  const { i18n } = useTranslation();
  const currency = useHouseholdCurrency();
  const locale = i18n.resolvedLanguage ?? 'pt';
  const decimals = currencyFractionDigits(currency);
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
  const symbol = parts.find((p) => p.type === 'currency')?.value ?? currency;
  return { symbol, decimals };
}
