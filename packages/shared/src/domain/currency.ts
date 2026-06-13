/**
 * Moedas via Intl (ISO 4217) — sem dependência externa.
 * Valores monetários são armazenados em unidades mínimas da moeda
 * (centavos pra BRL/USD/EUR, unidade inteira pra JPY, milésimos pra BHD).
 */

const FALLBACK_CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'CLP', 'JPY', 'CHF'];

export function listCurrencies(): string[] {
  if (typeof Intl.supportedValuesOf === 'function') {
    return Intl.supportedValuesOf('currency');
  }
  return FALLBACK_CURRENCIES;
}

export function isValidCurrency(code: string): boolean {
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}

const fractionDigitsCache = new Map<string, number>();

/** Casas decimais da moeda: BRL/USD → 2, JPY → 0, BHD → 3. */
export function currencyFractionDigits(currency: string): number {
  let digits = fractionDigitsCache.get(currency);
  if (digits === undefined) {
    digits =
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    fractionDigitsCache.set(currency, digits);
  }
  return digits;
}

/**
 * "5,49" / "5.49" / 5.49 em BRL → 549 (unidades mínimas).
 * Aceita vírgula ou ponto como separador decimal; quando ambos aparecem
 * ("1.234,56"), o último é o decimal e o outro é milhar.
 */
export function parseToMinorUnits(value: string | number, currency: string): number {
  let numeric: number;
  if (typeof value === 'number') {
    numeric = value;
  } else {
    const s = value.trim().replace(/\s/g, '');
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma === -1 && lastDot === -1) {
      numeric = Number(s);
    } else {
      const decimalSep = lastComma > lastDot ? ',' : '.';
      const thousandSep = decimalSep === ',' ? '.' : ',';
      numeric = Number(s.split(thousandSep).join('').replace(decimalSep, '.'));
    }
  }
  if (!Number.isFinite(numeric)) throw new Error(`valor monetário inválido: ${value}`);
  return Math.round(numeric * 10 ** currencyFractionDigits(currency));
}

/** Formata unidades mínimas como moeda no locale dado: (1234, 'pt-BR', 'BRL') → "R$ 12,34". */
export function formatCurrency(minorUnits: number, locale = 'pt-BR', currency = 'BRL'): string {
  const digits = currencyFractionDigits(currency);
  return (minorUnits / 10 ** digits).toLocaleString(locale, { style: 'currency', currency });
}

/** Atalho pro caso comum: BRL em pt-BR. */
export function formatBRL(minorUnits: number): string {
  return formatCurrency(minorUnits);
}

/** Sugestão de moeda padrão por idioma da UI. */
export function defaultCurrencyForLanguage(lang: string): string {
  const map: Record<string, string> = {
    pt: 'BRL',
    en: 'USD',
    es: 'EUR',
    it: 'EUR',
    de: 'EUR',
    fr: 'EUR',
  };
  return map[lang.split('-')[0] ?? ''] ?? 'USD';
}
