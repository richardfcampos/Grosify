import { describe, expect, it } from 'vitest';
import {
  currencyFractionDigits,
  defaultCurrencyForLanguage,
  formatCurrency,
  isValidCurrency,
  listCurrencies,
  parseToMinorUnits,
} from './currency.js';

describe('listCurrencies / isValidCurrency', () => {
  it('lista contém as principais moedas ISO 4217', () => {
    const all = listCurrencies();
    for (const code of ['BRL', 'USD', 'EUR', 'JPY', 'GBP', 'ARS']) {
      expect(all).toContain(code);
    }
    expect(all.length).toBeGreaterThan(100);
  });

  it('valida códigos', () => {
    expect(isValidCurrency('BRL')).toBe(true);
    expect(isValidCurrency('XYZ123')).toBe(false);
  });
});

describe('currencyFractionDigits', () => {
  it('BRL/USD têm 2, JPY tem 0, BHD tem 3', () => {
    expect(currencyFractionDigits('BRL')).toBe(2);
    expect(currencyFractionDigits('USD')).toBe(2);
    expect(currencyFractionDigits('JPY')).toBe(0);
    expect(currencyFractionDigits('BHD')).toBe(3);
  });
});

describe('parseToMinorUnits', () => {
  it('aceita vírgula decimal (BR)', () => {
    expect(parseToMinorUnits('5,49', 'BRL')).toBe(549);
  });
  it('aceita ponto decimal (US)', () => {
    expect(parseToMinorUnits('5.49', 'BRL')).toBe(549);
  });
  it('milhar + decimal misturados', () => {
    expect(parseToMinorUnits('1.234,56', 'BRL')).toBe(123456);
    expect(parseToMinorUnits('1,234.56', 'USD')).toBe(123456);
  });
  it('respeita casas decimais da moeda', () => {
    expect(parseToMinorUnits('1500', 'JPY')).toBe(1500);
    expect(parseToMinorUnits('1,234', 'BHD')).toBe(1234);
  });
  it('número direto', () => {
    expect(parseToMinorUnits(12.34, 'BRL')).toBe(1234);
  });
  it('rejeita lixo', () => {
    expect(() => parseToMinorUnits('abc', 'BRL')).toThrow();
  });
});

describe('formatCurrency', () => {
  it('formata BRL em pt-BR', () => {
    // Intl usa NBSP/narrow-NBSP entre símbolo e valor — normaliza pra espaço comum
    const formatted = formatCurrency(123456, 'pt-BR', 'BRL').replace(/[  ]/g, ' ');
    expect(formatted).toBe('R$ 1.234,56');
  });
  it('JPY sem decimais', () => {
    expect(formatCurrency(1500, 'ja-JP', 'JPY')).toContain('1,500');
  });
});

describe('defaultCurrencyForLanguage', () => {
  it('mapeia idiomas suportados', () => {
    expect(defaultCurrencyForLanguage('pt')).toBe('BRL');
    expect(defaultCurrencyForLanguage('pt-BR')).toBe('BRL');
    expect(defaultCurrencyForLanguage('de')).toBe('EUR');
    expect(defaultCurrencyForLanguage('xx')).toBe('USD');
  });
});
