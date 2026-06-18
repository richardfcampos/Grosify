interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  dark?: boolean;
}

/** Avaliação 1-5 estrelas; clicar na atual limpa. */
export function StarRating({ value, onChange, dark }: Props) {
  const off = dark ? 'text-stone-600' : 'text-zinc-300';
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={`text-2xl leading-none ${(value ?? 0) >= n ? 'text-amber-400' : off}`}
          aria-label={`${n}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
