import { Button } from '@grosify/ui';

export function Primary() {
  return <Button variant="primary">Iniciar compra</Button>;
}

export function Secondary() {
  return <Button variant="secondary">Adicionar item</Button>;
}

export function Ghost() {
  return <Button variant="ghost">Cancelar</Button>;
}

export function Sizes() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Button size="sm">Pequeno</Button>
      <Button size="md">Médio</Button>
      <Button size="lg">Grande</Button>
    </div>
  );
}

export function Disabled() {
  return (
    <Button variant="primary" disabled>
      Sincronizando…
    </Button>
  );
}

export function FullWidth() {
  return (
    <div style={{ width: 280 }}>
      <Button variant="primary" fullWidth>
        Finalizar compra
      </Button>
    </div>
  );
}
