import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import { splitMinorUnits } from '../lib/format-money.js';

export interface MoneyValueProps extends HTMLAttributes<HTMLSpanElement> {
  /** Valor em unidades mínimas da moeda (centavos, integer). Nunca float. */
  cents: number;
  /** Símbolo da moeda. Padrão `R$`. */
  symbol?: string;
  /** Casas decimais da moeda (JPY=0, BRL=2, BHD=3). */
  decimals?: number;
  /** Tamanho do display. `lg` = hero "Economizou R$ X". */
  size?: 'sm' | 'md' | 'lg';
  /** Cor semântica. `positive` verde (economia), `negative` vermelho. */
  tone?: 'default' | 'positive' | 'negative';
}

/**
 * Display de dinheiro em destaque — fonte Anton, centavos em sobrescrito
 * (`R$ 4⁹⁹`). Só para valores monetários enfáticos (hero, total, oferta).
 * Recebe centavos (integer) pra nunca depender de float.
 */
export function MoneyValue({
  cents,
  symbol = 'R$',
  decimals = 2,
  size = 'md',
  tone = 'default',
  className,
  ...rest
}: MoneyValueProps) {
  const { whole, fraction } = splitMinorUnits(cents, decimals);
  return (
    <span
      className={cn('gro-money', `gro-money--${size}`, tone !== 'default' && `gro-money--${tone}`, className)}
      {...rest}
    >
      <span className="gro-money__symbol">{symbol}</span>
      <span className="gro-money__whole">{whole}</span>
      {fraction && <span className="gro-money__cents">{fraction}</span>}
    </span>
  );
}
