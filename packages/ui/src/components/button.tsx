import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Hierarquia visual. `primary` = ação principal (verde economia). */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Tamanho do alvo de toque. `md` é o padrão mobile (min 48px). */
  size?: 'sm' | 'md' | 'lg';
  /** Ocupa a largura total do container. */
  fullWidth?: boolean;
  children?: ReactNode;
}

/**
 * Botão de ação. `primary` é o verde economia do app; `secondary` e `ghost`
 * para ações de menor peso. Sempre com alvo de toque generoso (mobile-first).
 */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'gro-btn',
        `gro-btn--${variant}`,
        `gro-btn--${size}`,
        fullWidth && 'gro-btn--block',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
