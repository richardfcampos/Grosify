/**
 * Mini-gráfico de variação de preço. Sobe (último ≥ primeiro) → vermelho (subiu),
 * desce → verde (economia). Cor só em evento de dinheiro, conforme a regra de marca.
 * Recebe um array de centavos (integer).
 */
export function Sparkline({
  data,
  w = 96,
  h = 30,
  color,
}: {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map(
    (v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / span) * (h - 4) - 2] as const,
  );
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const up = data[data.length - 1]! >= data[0]!;
  const c = color ?? (up ? 'var(--gro-red)' : 'var(--gro-green)');
  const last = pts[pts.length - 1]!;
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.4} fill={c} />
    </svg>
  );
}
