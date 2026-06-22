import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Eleva com sombra em vez de borda. */
  elevated?: boolean;
  children?: ReactNode;
}

/**
 * Superfície base — fundo branco quente, borda suave, cantos arredondados.
 * Container neutro pra listas, detalhes e blocos do app (modo planejamento, sóbrio).
 */
export function Card({ elevated = false, className, children, ...rest }: CardProps) {
  return (
    <div className={cn('gro-card', elevated && 'gro-card--elevated', className)} {...rest}>
      {children}
    </div>
  );
}
