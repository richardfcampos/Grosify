import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export interface StampProps extends HTMLAttributes<HTMLSpanElement> {
  /** Texto do carimbo. Padrão `COMPRADO`. */
  label?: string;
  /** Mostra o check antes do texto. */
  checked?: boolean;
}

/**
 * Carimbo "✓ COMPRADO" — azul carimbo, rotacionado, estilo registro auditável.
 * Marca um item já comprado no modo compra / recibo.
 */
export function Stamp({ label = 'COMPRADO', checked = true, className, ...rest }: StampProps) {
  return (
    <span className={cn('gro-stamp', className)} {...rest}>
      {checked && <span aria-hidden>✓</span>}
      {label}
    </span>
  );
}
