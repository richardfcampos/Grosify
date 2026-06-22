import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import { splitMinorUnits } from '../lib/format-money.js';

export interface PriceChangeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Variação em centavos (integer). Negativo = caiu (verde), positivo = subiu (vermelho). */
  deltaCents: number;
  /** Símbolo da moeda. Padrão `R$`. */
  symbol?: string;
  /** Casas decimais da moeda. */
  decimals?: number;
}

/**
 * Indicador de variação de preço — mono tabular, seta + valor. Caiu fica verde
 * (economia), subiu fica vermelho. Usa a variação em centavos (integer).
 */
export function PriceChange({
  deltaCents,
  symbol = 'R$',
  decimals = 2,
  className,
  ...rest
}: PriceChangeProps) {
  const down = deltaCents < 0;
  const { whole, fraction } = splitMinorUnits(Math.abs(deltaCents), decimals);
  return (
    <span
      className={cn('gro-pricechange', down ? 'gro-pricechange--down' : 'gro-pricechange--up', className)}
      {...rest}
    >
      <span aria-hidden>{down ? '↓' : '↑'}</span>
      <span>
        {symbol} {whole}
        {fraction && `,${fraction}`}
      </span>
    </span>
  );
}
