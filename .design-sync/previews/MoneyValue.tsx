import { MoneyValue } from '@grosify/ui';

export function Hero() {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'Lexend, sans-serif', fontSize: 14, color: '#78716c', marginBottom: 4 }}>
        Você economizou
      </div>
      <MoneyValue cents={1850} size="lg" tone="positive" />
    </div>
  );
}

export function Total() {
  return <MoneyValue cents={13690} size="md" />;
}

export function Negative() {
  return <MoneyValue cents={4220} size="md" tone="negative" />;
}

export function Sizes() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
      <MoneyValue cents={499} size="sm" />
      <MoneyValue cents={4990} size="md" />
      <MoneyValue cents={49900} size="lg" />
    </div>
  );
}
