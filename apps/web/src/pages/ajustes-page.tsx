import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n/index.js';
import { api } from '../lib/api.js';
import { signOut } from '../lib/auth-client.js';
import { useConfirm } from '../lib/confirm.js';
import { useHouseholdPlan } from '../lib/use-currency.js';
import { clearLocalData, getSyncState, subscribeSync, syncNow } from '../sync/engine.js';
import { exportPricesCsv, importBackup } from '../lib/backup.js';
import { useRef, useSyncExternalStore } from 'react';
import { Icon } from '../features/ui/icon.js';
import { useTheme, DIRECTIONS } from '../features/ui/theme-provider.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3010';

export function AjustesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const plan = useHouseholdPlan();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const syncState = useSyncExternalStore(subscribeSync, getSyncState);
  const restoreRef = useRef<HTMLInputElement>(null);
  const { mode, dir, setMode, setDir } = useTheme();

  async function onRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ok = await confirm({
      title: t('settings.restore'),
      message: t('settings.restoreConfirm'),
      confirmLabel: t('settings.restore'),
    });
    if (!ok) return;
    try {
      const json = JSON.parse(await file.text());
      await importBackup(json);
    } catch {
      // backup inválido — ignora
    }
  }

  const invite = useMutation({
    mutationFn: async () => {
      const res = await api.households.invites.$post();
      if (!res.ok) throw new Error('invite_failed');
      return res.json();
    },
    onSuccess: (data) => setInviteUrl(`${window.location.origin}/convite/${data.code}`),
  });

  async function onExport() {
    const res = await fetch(`${API_URL}/me/export`, { credentials: 'include' });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grosify-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onDelete() {
    const ok = await confirm({
      title: t('settings.deleteAccount'),
      message: t('settings.deleteConfirm'),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`${API_URL}/me`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      // limpa cache local e desloga
      indexedDB.deleteDatabase('grosify');
      await signOut();
      navigate({ to: '/entrar', search: { redirect: undefined } });
    } else {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-col gap-6 px-5 py-6">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: '/' })} className="text-sm text-zinc-500">
          ← {t('common.back')}
        </button>
        <h1 className="text-2xl font-bold text-zinc-900">{t('settings.title')}</h1>
      </header>

      <section className="flex flex-col gap-2">
        <label htmlFor="lang" className="text-sm font-medium text-zinc-600">
          {t('dashboard.language')}
        </label>
        <select
          id="lang"
          value={i18n.resolvedLanguage}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
          className="min-h-12 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-base"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t('appearance.title')}
        </h2>
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{t('appearance.theme')}</span>
            <div className="seg">
              <button aria-pressed={mode === 'light'} onClick={() => setMode('light')}>
                <Icon name="sun" size={15} /> {t('appearance.light')}
              </button>
              <button aria-pressed={mode === 'dark'} onClick={() => setMode('dark')}>
                <Icon name="moon" size={15} /> {t('appearance.dark')}
              </button>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--app-line)', paddingTop: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
              {t('appearance.direction')}
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
              {t(`appearance.dir.${dir}Tag`)}
            </div>
            <div className="seg" style={{ width: '100%' }}>
              {DIRECTIONS.map((d) => (
                <button
                  key={d.id}
                  aria-pressed={dir === d.id}
                  onClick={() => setDir(d.id)}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {t(`appearance.dir.${d.id}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-zinc-200 p-4">
        <div className="flex items-center justify-between">
          <span className="font-medium text-zinc-900">{t('billing.plan')}</span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              plan === 'pro' ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
            }`}
          >
            {plan === 'pro' ? t('billing.proName') : t('billing.freeName')}
          </span>
        </div>
        {plan === 'free' && (
          <>
            <p className="text-sm text-zinc-600">{t('billing.proPitch')}</p>
            <button
              disabled
              title={t('billing.comingSoon')}
              className="min-h-11 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white opacity-60"
            >
              {t('billing.upgrade')}
            </button>
            <p className="text-xs text-zinc-400">{t('billing.comingSoon')}</p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t('dashboard.inviteSection')}
        </h2>
        {inviteUrl ? (
          <div className="flex flex-col gap-2">
            <code className="break-all rounded-lg bg-zinc-100 px-3 py-2 text-sm">{inviteUrl}</code>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="min-h-11 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white"
            >
              {copied ? t('dashboard.copied') : t('dashboard.copyLink')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => invite.mutate()}
            disabled={invite.isPending}
            className="min-h-11 rounded-xl border border-green-600 px-4 text-sm font-semibold text-green-700 disabled:opacity-50"
          >
            {invite.isPending ? t('dashboard.generating') : t('dashboard.generateInvite')}
          </button>
        )}
      </section>

      <Link
        to="/categorias"
        className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3"
      >
        <span className="font-medium text-zinc-900">{t('categories.title')}</span>
        <span className="text-zinc-400">›</span>
      </Link>

      <Link
        to="/analise"
        className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3"
      >
        <span className="font-medium text-zinc-900">{t('analytics.title')}</span>
        <span className="text-zinc-400">›</span>
      </Link>

      <Link
        to="/historico"
        className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3"
      >
        <span className="font-medium text-zinc-900">{t('history.title')}</span>
        <span className="text-zinc-400">›</span>
      </Link>

      <Link
        to="/membros"
        className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3"
      >
        <span className="font-medium text-zinc-900">{t('members.title')}</span>
        <span className="text-zinc-400">›</span>
      </Link>

      <Link
        to="/atividades"
        className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3"
      >
        <span className="font-medium text-zinc-900">{t('activity.title')}</span>
        <span className="text-zinc-400">›</span>
      </Link>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t('settings.data')}
        </h2>
        <button
          onClick={() => void syncNow()}
          disabled={syncState === 'syncing'}
          className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 text-left disabled:opacity-60"
        >
          <span className="flex flex-col">
            <span className="font-medium text-zinc-900">{t('settings.syncNow')}</span>
            <span className="text-sm text-zinc-500">{t('settings.syncHint')}</span>
          </span>
          <span className="text-sm font-medium text-zinc-500">
            {syncState === 'syncing'
              ? t('sync.syncing')
              : syncState === 'error'
                ? t('sync.error')
                : syncState === 'offline'
                  ? t('sync.offline')
                  : t('sync.synced')}
          </span>
        </button>
        <button
          onClick={onExport}
          className="flex flex-col items-start rounded-xl border border-zinc-200 px-4 py-3 text-left"
        >
          <span className="font-medium text-zinc-900">{t('settings.exportData')}</span>
          <span className="text-sm text-zinc-500">{t('settings.exportHint')}</span>
        </button>
        <button
          onClick={() => void exportPricesCsv()}
          className="flex flex-col items-start rounded-xl border border-zinc-200 px-4 py-3 text-left"
        >
          <span className="font-medium text-zinc-900">{t('settings.exportCsv')}</span>
          <span className="text-sm text-zinc-500">{t('settings.exportCsvHint')}</span>
        </button>
        <button
          onClick={() => restoreRef.current?.click()}
          className="flex flex-col items-start rounded-xl border border-zinc-200 px-4 py-3 text-left"
        >
          <span className="font-medium text-zinc-900">{t('settings.restore')}</span>
          <span className="text-sm text-zinc-500">{t('settings.restoreHint')}</span>
        </button>
        <input
          ref={restoreRef}
          type="file"
          accept="application/json,.json"
          onChange={onRestore}
          className="hidden"
        />
        <button
          onClick={onDelete}
          disabled={busy}
          className="flex flex-col items-start rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left disabled:opacity-50"
        >
          <span className="font-medium text-red-700">{t('settings.deleteAccount')}</span>
          <span className="text-sm text-red-500">{t('settings.deleteHint')}</span>
        </button>
      </section>

      <button
        onClick={async () => {
          await clearLocalData();
          await signOut();
          navigate({ to: '/entrar', search: { redirect: undefined } });
        }}
        className="min-h-12 rounded-xl border border-zinc-300 font-medium text-zinc-700"
      >
        {t('auth.logout')}
      </button>

      <Link to="/privacidade" className="text-center text-sm text-zinc-400 underline">
        {t('settings.privacy')}
      </Link>
    </main>
  );
}
