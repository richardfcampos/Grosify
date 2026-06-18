import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../lib/confirm.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3010';

interface Member {
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  name: string;
  email: string;
}

/** Gestão de membros da casa: papéis (owner/admin/member/viewer) e remoção. */
export function MembrosPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState('');
  const [myRole, setMyRole] = useState<Member['role']>('member');

  async function load() {
    const res = await fetch(`${API_URL}/households/members`, { credentials: 'include' });
    if (!res.ok) return;
    const data = (await res.json()) as { members: Member[]; me: string; myRole: Member['role'] };
    setMembers(data.members);
    setMe(data.me);
    setMyRole(data.myRole);
  }
  useEffect(() => {
    void load();
  }, []);

  const canManage = myRole === 'owner' || myRole === 'admin';

  async function changeRole(userId: string, role: string) {
    await fetch(`${API_URL}/households/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
      credentials: 'include',
    });
    void load();
  }

  async function remove(m: Member) {
    const ok = await confirm({
      title: t('members.remove'),
      message: t('members.removeConfirm', { name: m.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await fetch(`${API_URL}/households/members/${m.userId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    void load();
  }

  return (
    <main className="flex flex-col gap-4 px-5 py-6 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: '/ajustes' })} className="text-sm text-zinc-500">
          ← {t('common.back')}
        </button>
        <h1 className="text-2xl font-bold text-zinc-900">{t('members.title')}</h1>
      </header>

      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zinc-900">
                {m.name}
                {m.userId === me ? ` (${t('members.you')})` : ''}
              </p>
              <p className="truncate text-sm text-zinc-500">{m.email}</p>
            </div>
            {canManage && m.role !== 'owner' && m.userId !== me ? (
              <>
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m.userId, e.target.value)}
                  className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                >
                  <option value="admin">{t('members.roles.admin')}</option>
                  <option value="member">{t('members.roles.member')}</option>
                  <option value="viewer">{t('members.roles.viewer')}</option>
                </select>
                <button onClick={() => remove(m)} className="text-red-600" aria-label={t('members.remove')}>
                  🗑
                </button>
              </>
            ) : (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
                {t(`members.roles.${m.role}`)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
