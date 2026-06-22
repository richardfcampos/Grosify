interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  /** Aceito por compatibilidade; a cor vem dos tokens (adapta a claro/escuro). */
  dark?: boolean;
}

/** Avaliação 1-5 estrelas; clicar na atual limpa. */
export function StarRating({ value, onChange }: Props) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className="text-2xl leading-none"
          style={{ color: (value ?? 0) >= n ? 'var(--gro-yellow)' : 'var(--app-border)' }}
          aria-label={`${n}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
