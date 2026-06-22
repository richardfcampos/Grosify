/** Cabeçalho de seção — kicker (rótulo maiúsculo), título e subtítulo opcional. */
export function SectionTitle({
  kicker,
  title,
  sub,
}: {
  kicker?: string;
  title: string;
  sub?: string;
}) {
  return (
    <div>
      {kicker && (
        <div className="kicker" style={{ marginBottom: 6 }}>
          {kicker}
        </div>
      )}
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-.01em' }}>{title}</h2>
      {sub && (
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
          {sub}
        </p>
      )}
    </div>
  );
}
