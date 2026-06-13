import { useMutation } from '@tanstack/react-query';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n/index.js';
import { api } from '../lib/api.js';
import { signOut, useSession } from '../lib/auth-client.js';
import { useMembership } from '../lib/use-membership.js';
import { Loading } from './household-pages.js';

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data: session, isPending } = useSession();
  const membership = useMembership(!!session);
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const invite = useMutation({
    mutationFn: async () => {
      const res = await api.households.invites.$post();
      if (!res.ok) throw new Error('inviteFailed');
      return res.json();
    },
    onSuccess: (data) => setInviteCode(data.code),
  });

  if (isPending || (session && membership.isLoading)) return <Loading />;
  if (!session) return <Navigate to="/entrar" search={{ redirect: '/' }} />;
  if (!membership.data) return <Navigate to="/casa" />;

  const inviteUrl = inviteCode ? `${window.location.origin}/convite/${inviteCode}` : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-bold text-zinc-900">{membership.data.name}</h1>
            <p className="text-xs text-zinc-500">
              {membership.data.plan === 'free' ? t('dashboard.planFree') : t('dashboard.planPro')}
            </p>
          </div>
        </div>
        <button
          onClick={async () => {
            await signOut();
            navigate({ to: '/entrar', search: { redirect: undefined } });
          }}
          className="text-sm font-medium text-zinc-500"
        >
          {t('auth.logout')}
        </button>
      </header>

      <section className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-zinc-500">
        <p className="font-medium">{t('dashboard.ready')}</p>
        <p className="mt-1 text-sm">{t('dashboard.comingSoon')}</p>
      </section>

      <section className="rounded-2xl border border-zinc-200 p-5">
        <h2 className="font-semibold text-zinc-900">{t('dashboard.inviteSection')}</h2>
        <p className="mt-1 text-sm text-zinc-600">{t('dashboard.inviteDescription')}</p>
        {inviteUrl ? (
          <div className="mt-3 flex flex-col gap-2">
            <code className="break-all rounded-lg bg-zinc-100 px-3 py-2 text-sm">{inviteUrl}</code>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white"
            >
              {copied ? t('dashboard.copied') : t('dashboard.copyLink')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => invite.mutate()}
            disabled={invite.isPending}
            className="mt-3 w-full rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-green-700 disabled:opacity-50"
          >
            {invite.isPending ? t('dashboard.generating') : t('dashboard.generateInvite')}
          </button>
        )}
      </section>

      <section className="mt-auto flex items-center justify-between rounded-2xl border border-zinc-200 p-4">
        <label htmlFor="lang" className="text-sm font-medium text-zinc-600">
          {t('dashboard.language')}
        </label>
        <select
          id="lang"
          value={i18n.resolvedLanguage}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
          className="min-h-11 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </section>
    </main>
  );
}
