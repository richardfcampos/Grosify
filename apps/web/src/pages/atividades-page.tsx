import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, SectionTitle } from '../features/ui/index.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3010';

interface Activity {
  id: string;
  actorName: string | null;
  action: string;
  summary: string | null;
  createdAt: string;
}

const ICON: Record<string, string> = {
  item_added: '➕',
  list_created: '📋',
  shopping_completed: '🛒',
  member_removed: '👤',
};

/** Feed de atividades da casa (quem fez o quê). */
export function AtividadesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Activity[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/households/activities`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { activities: [] }))
      .then((d: { activities: Activity[] }) => setItems(d.activities))
      .catch(() => {});
  }, []);

  const fmtDate = (iso: string) => new Date(iso).toLocaleString(i18n.resolvedLanguage);

  return (
    <main className="screen-in flex flex-col gap-4 px-[18px] py-6 pb-24">
      <button
        onClick={() => navigate({ to: '/ajustes' })}
        className="muted flex items-center gap-1 text-sm font-semibold"
      >
        <Icon name="back" size={17} /> {t('common.back')}
      </button>
      <SectionTitle title={t('activity.title')} />

      {items.length === 0 ? (
        <p className="muted mt-6 text-center">{t('activity.empty')}</p>
      ) : (
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xl">{ICON[a.action] ?? '•'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold">{a.actorName ?? '—'}</span>{' '}
                  {t(`activity.action.${a.action}`, { defaultValue: a.action })}
                  {a.summary ? `: ${a.summary}` : ''}
                </p>
                <p className="muted mt-0.5 text-xs">{fmtDate(a.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
