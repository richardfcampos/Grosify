import { Stamp } from '@grosify/ui';

export function Comprado() {
  return <Stamp />;
}

export function SemCheck() {
  return <Stamp label="PAGO" checked={false} />;
}

export function Custom() {
  return <Stamp label="CONFERIDO" />;
}
