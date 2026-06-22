import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Significado semântico de dinheiro. `economia` verde, `subiu` vermelho, `oferta` amarelo. */
  tone?: 'economia' | 'subiu' | 'oferta' | 'neutral';
  children?: ReactNode;
}

/**
 * Selo semântico curto. As cores seguem a regra do design system: verde/vermelho/
 * amarelo só aparecem em eventos de dinheiro (economia, aumento, oferta).
 */
export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn('gro-badge', `gro-badge--${tone}`, className)} {...rest}>
      {children}
    </span>
  );
}
