import { PriceChange } from '@grosify/ui';

export function Caiu() {
  return <PriceChange deltaCents={-50} />;
}

export function Subiu() {
  return <PriceChange deltaCents={75} />;
}

export function Ambos() {
  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <PriceChange deltaCents={-120} />
      <PriceChange deltaCents={340} />
    </div>
  );
}
