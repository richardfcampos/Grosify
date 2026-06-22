import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** Estado. `synced` verde, `error` vermelho, `default` escuro, `muted` cinza. */
  tone?: 'default' | 'synced' | 'error' | 'muted';
  children?: ReactNode;
}

/**
 * Pílula de status compacta — usada pro estado de sync (offline / sincronizando /
 * sincronizado / pendências) e rótulos curtos no canto da tela.
 */
export function Chip({ tone = 'default', className, children, ...rest }: ChipProps) {
  return (
    <span className={cn('gro-chip', `gro-chip--${tone}`, className)} {...rest}>
      {children}
    </span>
  );
}
