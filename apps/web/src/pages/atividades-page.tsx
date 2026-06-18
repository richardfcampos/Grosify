import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
    <main className="flex flex-col gap-4 px-5 py-6 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: '/ajustes' })} className="text-sm text-zinc-500">
          ← {t('common.back')}
        </button>
        <h1 className="text-2xl font-bold text-zinc-900">{t('activity.title')}</h1>
      </header>

      {items.length === 0 ? (
        <p className="mt-6 text-center text-zinc-500">{t('activity.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-3">
              <span className="text-xl">{ICON[a.action] ?? '•'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-900">
                  <span className="font-medium">{a.actorName ?? '—'}</span>{' '}
                  {t(`activity.action.${a.action}`, { defaultValue: a.action })}
                  {a.summary ? `: ${a.summary}` : ''}
                </p>
                <p className="text-xs text-zinc-400">{fmtDate(a.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
