import type { ReactNode } from 'react';
import { Icon, type IconName } from './icon.js';

/** Estado vazio — ícone tracejado neutro, título, corpo e ação opcional. */
export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="fade"
      style={{
        textAlign: 'center',
        padding: '46px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <div
        style={{
          width: 76,
          height: 76,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
          color: 'var(--app-gray)',
          background:
            'repeating-linear-gradient(135deg,var(--app-surface-2) 0 7px,var(--app-bg) 7px 14px)',
          border: '1px dashed var(--app-border)',
        }}
      >
        <Icon name={icon} size={30} stroke={1.6} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 17 }}>{title}</div>
      {body && (
        <p className="muted" style={{ margin: '2px 0 0', fontSize: 14, maxWidth: 270, lineHeight: 1.5 }}>
          {body}
        </p>
      )}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
