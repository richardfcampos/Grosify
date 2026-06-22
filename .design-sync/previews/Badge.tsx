import { Badge } from '@grosify/ui';

export function Economia() {
  return <Badge tone="economia">−12% no mês</Badge>;
}

export function Subiu() {
  return <Badge tone="subiu">↑ 8% vs. abril</Badge>;
}

export function Oferta() {
  return <Badge tone="oferta">Melhor preço</Badge>;
}

export function Neutral() {
  return <Badge tone="neutral">Recorrente</Badge>;
}

export function Todos() {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge tone="economia">Economia</Badge>
      <Badge tone="subiu">Subiu</Badge>
      <Badge tone="oferta">Oferta</Badge>
      <Badge tone="neutral">Neutro</Badge>
    </div>
  );
}
