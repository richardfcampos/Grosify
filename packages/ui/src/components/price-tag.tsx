import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface PriceTagProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
}

/**
 * Etiqueta de oferta — amarelo de encarte, leve rotação (-3°) e sombra dura.
 * Vocabulário visual de panfleto brasileiro; usar SÓ em eventos de preço
 * (melhor preço, oferta, destaque do scanner).
 */
export function PriceTag({ className, children, ...rest }: PriceTagProps) {
  return (
    <span className={cn('gro-pricetag', className)} {...rest}>
      {children}
    </span>
  );
}
