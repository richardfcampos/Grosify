/**
 * Quebra um valor em unidades mínimas (centavos, integer) em parte inteira e
 * fração, pra renderizar centavos em sobrescrito (`R$ 4⁹⁹`). Sem float.
 */
export function splitMinorUnits(
  amount: number,
  decimals = 2,
): { whole: string; fraction: string } {
  const divisor = 10 ** decimals;
  const negative = amount < 0;
  const abs = Math.abs(Math.trunc(amount));
  const whole = Math.floor(abs / divisor);
  const fraction = abs % divisor;
  const wholeStr = whole.toLocaleString('pt-BR');
  const fractionStr = decimals > 0 ? String(fraction).padStart(decimals, '0') : '';
  return { whole: `${negative ? '−' : ''}${wholeStr}`, fraction: fractionStr };
}
