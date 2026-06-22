import { Chip } from '@grosify/ui';

export function Sincronizando() {
  return <Chip tone="default">Sincronizando…</Chip>;
}

export function Sincronizado() {
  return <Chip tone="synced">Sincronizado ✓</Chip>;
}

export function Pendentes() {
  return <Chip tone="error">3 pendentes</Chip>;
}

export function Offline() {
  return <Chip tone="muted">Offline</Chip>;
}

export function Estados() {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Chip tone="default">Sincronizando…</Chip>
      <Chip tone="synced">Sincronizado ✓</Chip>
      <Chip tone="error">3 pendentes</Chip>
      <Chip tone="muted">Offline</Chip>
    </div>
  );
}
