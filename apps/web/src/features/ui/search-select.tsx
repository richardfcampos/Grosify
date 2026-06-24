import { useMemo, useState } from 'react';
import { Icon } from './icon.js';

export interface SearchOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: SearchOption[];
  /** Texto quando nada selecionado. */
  placeholder: string;
  /** Placeholder do campo de busca dentro da folha. */
  searchPlaceholder: string;
  onChange: (value: string) => void;
  /** Ação extra no rodapé da folha (ex.: "+ Nova loja"). */
  footer?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Campo de seleção com busca: um botão que abre uma folha com campo de busca +
 * lista filtrada. Substitui `<select>` nativo quando há muitas opções (ex.: lojas).
 */
export function SearchSelect({
  value,
  options,
  placeholder,
  searchPlaceholder,
  onChange,
  footer,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }, [options, q]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQ('');
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="gro-field flex items-center justify-between gap-2 text-left"
      >
        <span className={selected ? 'truncate' : 'muted truncate'}>
          {selected?.label ?? placeholder}
        </span>
        <Icon name="chev" size={16} style={{ transform: 'rotate(90deg)', flex: 'none', opacity: 0.5 }} />
      </button>

      {open && (
        <div className="gro-sheet-backdrop" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="gro-sheet-panel flex flex-col gap-2">
            <div className="gro-sheet-grip" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="gro-field"
            />
            <ul className="flex flex-col gap-1 overflow-auto" style={{ maxHeight: '45vh' }}>
              {filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => pick(o.value)}
                    className="tap flex min-h-11 w-full items-center justify-between rounded-xl px-4 text-left text-sm font-medium"
                    style={{ background: 'var(--app-surface-2)' }}
                  >
                    <span className="truncate">{o.label}</span>
                    {o.value === value && <Icon name="check" size={16} style={{ color: 'var(--gro-green)' }} />}
                  </button>
                </li>
              ))}
            </ul>
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
