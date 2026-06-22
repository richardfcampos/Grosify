import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Icon, SectionTitle } from '../features/ui/index.js';
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
    <main className="screen-in flex flex-col gap-4 px-[18px] py-6 pb-24">
      <button
        onClick={() => navigate({ to: '/ajustes' })}
        className="muted flex items-center gap-1 text-sm font-semibold"
      >
        <Icon name="back" size={17} /> {t('common.back')}
      </button>
      <SectionTitle title={t('members.title')} />

      <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
        {members.map((m) => (
          <div key={m.userId} className="flex items-center gap-3 px-4 py-3.5">
            <div
              className="flex flex-none items-center justify-center rounded-full"
              style={{
                width: 40,
                height: 40,
                background: 'var(--app-surface-2)',
                border: '1px solid var(--app-border)',
                fontFamily: 'var(--gro-font-money)',
                fontSize: 18,
              }}
            >
              {m.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {m.name}
                {m.userId === me && <span className="muted font-normal"> · {t('members.you')}</span>}
              </p>
              <p className="muted truncate text-[12.5px]">{m.email}</p>
            </div>
            {canManage && m.role !== 'owner' && m.userId !== me ? (
              <>
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m.userId, e.target.value)}
                  className="rounded-lg border border-[var(--app-border)] bg-transparent px-2 py-1 text-sm"
                >
                  <option value="admin">{t('members.roles.admin')}</option>
                  <option value="member">{t('members.roles.member')}</option>
                  <option value="viewer">{t('members.roles.viewer')}</option>
                </select>
                <button onClick={() => remove(m)} className="text-[var(--gro-red)]" aria-label={t('members.remove')}>
                  🗑
                </button>
              </>
            ) : (
              <Badge tone="neutral">{t(`members.roles.${m.role}`)}</Badge>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
