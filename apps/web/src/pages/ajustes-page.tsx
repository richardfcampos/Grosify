import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n/index.js';
import { api } from '../lib/api.js';
import { signOut, useSession } from '../lib/auth-client.js';
import { useConfirm } from '../lib/confirm.js';
import { useHouseholdPlan } from '../lib/use-currency.js';
import { useMembership } from '../lib/use-membership.js';
import { HouseholdSwitcher } from '../features/catalog/household-switcher.js';
import { clearLocalData, getSyncState, subscribeSync, syncNow } from '../sync/engine.js';
import { exportPricesCsv, importBackup } from '../lib/backup.js';
import {
  Badge,
  Button,
  Chip,
  DIRECTIONS,
  type Direction,
  Icon,
  type IconName,
  type Mode,
  SectionTitle,
  useTheme,
} from '../features/ui/index.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3010';

/** Ajustes = hub da casa: perfil, aparência, plano, convite, atalhos (histórico/
 *  análise/membros…) e dados (export/restore/excluir). Visual do design system. */
export function AjustesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const plan = useHouseholdPlan();
  const membership = useMembership(true);
  const { data: session } = useSession();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [emailSent, setEmailSent] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const syncState = useSyncExternalStore(subscribeSync, getSyncState);
  const restoreRef = useRef<HTMLInputElement>(null);
  const { mode, dir, setMode, setDir } = useTheme();
  // salva a preferência visual na conta (sincroniza entre aparelhos); localStorage já guardou local
  const saveAppearance = (json: { themeMode?: Mode; themeDir?: Direction }) =>
    void api.households.settings.$post({ json }).catch(() => {});

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

  // mapeia o código de erro da API (ex.: email_not_verified) p/ mensagem traduzida
  const inviteErrMsg = (code: string) => t(`errors.${code}`, { defaultValue: t('errors.generic') });

  const invite = useMutation({
    mutationFn: async () => {
      const res = await api.households.invites.$post();
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'generic');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setInviteError(null);
      setInviteUrl(`${window.location.origin}/convite/${data.code}`);
    },
    onError: (e: Error) => setInviteError(inviteErrMsg(e.message)),
  });

  const inviteByEmail = useMutation({
    mutationFn: async (email: string) => {
      const res = await api.households.invites.email.$post({ json: { email } });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'generic');
      }
      return res.json();
    },
    onSuccess: (_data, email) => {
      setInviteError(null);
      setEmailSent(email);
      setInviteEmail('');
    },
    onError: (e: Error) => setInviteError(inviteErrMsg(e.message)),
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
      indexedDB.deleteDatabase('grosify');
      await signOut();
      navigate({ to: '/entrar', search: { redirect: undefined } });
    } else {
      setBusy(false);
    }
  }

  const syncLabel =
    syncState === 'syncing'
      ? t('sync.syncing')
      : syncState === 'error'
        ? t('sync.error')
        : syncState === 'offline'
          ? t('sync.offline')
          : t('sync.synced');

  return (
    <main className="screen-in flex flex-col gap-5 px-[18px] py-6 pb-28">
      <button
        onClick={() => navigate({ to: '/' })}
        className="muted flex items-center gap-1 text-sm font-semibold"
      >
        <Icon name="back" size={17} /> {t('common.back')}
      </button>
      <SectionTitle kicker={membership.data?.name ?? ''} title={t('settings.title')} />

      {/* perfil */}
      <div className="card flex items-center gap-3.5" style={{ padding: 16 }}>
        <div
          className="flex flex-none items-center justify-center"
          style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--app-surface-2)' }}
        >
          <Icon name="user" size={24} style={{ color: 'var(--app-gray)' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{session?.user?.name ?? membership.data?.name}</div>
          {session?.user?.email && <div className="muted truncate text-sm">{session.user.email}</div>}
        </div>
        <Badge tone={plan === 'pro' ? 'oferta' : 'neutral'}>
          {plan === 'pro' ? t('billing.proName') : t('billing.freeName')}
        </Badge>
      </div>

      {/* aparência */}
      <Section kicker={t('appearance.title')}>
        <div className="card flex flex-col gap-3.5" style={{ padding: 16 }}>
          <div className="flex items-center justify-between gap-2.5">
            <span className="font-semibold">{t('appearance.theme')}</span>
            <div className="seg">
              <button
                aria-pressed={mode === 'light'}
                onClick={() => {
                  setMode('light');
                  saveAppearance({ themeMode: 'light' });
                }}
              >
                <Icon name="sun" size={15} /> {t('appearance.light')}
              </button>
              <button
                aria-pressed={mode === 'dark'}
                onClick={() => {
                  setMode('dark');
                  saveAppearance({ themeMode: 'dark' });
                }}
              >
                <Icon name="moon" size={15} /> {t('appearance.dark')}
              </button>
              <button
                aria-pressed={mode === 'system'}
                onClick={() => {
                  setMode('system');
                  saveAppearance({ themeMode: 'system' });
                }}
              >
                {t('appearance.system')}
              </button>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--app-line)', paddingTop: 14 }}>
            <div className="mb-1 font-semibold">{t('appearance.direction')}</div>
            <div className="muted mb-2.5 text-[12.5px]">{t(`appearance.dir.${dir}Tag`)}</div>
            <div className="seg" style={{ width: '100%' }}>
              {DIRECTIONS.map((d) => (
                <button
                  key={d.id}
                  aria-pressed={dir === d.id}
                  onClick={() => {
                    setDir(d.id);
                    saveAppearance({ themeDir: d.id });
                  }}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {t(`appearance.dir.${d.id}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* idioma */}
      <Section kicker={t('dashboard.language')}>
        <select
          value={i18n.resolvedLanguage}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
          className="gro-field"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </Section>

      {/* plano */}
      <Section kicker={t('billing.plan')}>
        <div className="card flex flex-col gap-2.5" style={{ padding: 16 }}>
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              {plan === 'pro' ? t('billing.proName') : t('billing.freeName')}
            </span>
            <Badge tone={plan === 'pro' ? 'oferta' : 'neutral'}>
              {plan === 'pro' ? t('billing.proName') : t('billing.freeName')}
            </Badge>
          </div>
          {plan === 'free' && (
            <>
              <p className="muted text-sm">{t('billing.proPitch')}</p>
              <Button variant="primary" size="md" disabled title={t('billing.comingSoon')}>
                {t('billing.upgrade')}
              </Button>
              <p className="muted text-xs">{t('billing.comingSoon')}</p>
            </>
          )}
        </div>
      </Section>

      {/* suas casas (multi-casa) */}
      <Section kicker={t('household.yourHouses')}>
        <HouseholdSwitcher />
      </Section>

      {/* convite */}
      <Section kicker={t('dashboard.inviteSection')}>
        {/* por e-mail: link amarrado ao endereço convidado */}
        {emailSent ? (
          <p className="muted text-sm">{t('household.inviteEmailSent', { email: emailSent })}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inviteEmail) inviteByEmail.mutate(inviteEmail);
            }}
            className="flex flex-col gap-2"
          >
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={t('household.inviteEmailPlaceholder')}
              aria-label={t('household.inviteEmailLabel')}
              className="gro-field gro-field--mono"
            />
            <Button
              variant="primary"
              size="md"
              fullWidth
              type="submit"
              disabled={inviteByEmail.isPending || !inviteEmail}
            >
              {inviteByEmail.isPending ? t('auth.sending') : t('household.inviteEmailCta')}
            </Button>
          </form>
        )}

        {inviteError && (
          <p className="mt-2 text-sm" style={{ color: 'var(--gro-red)' }}>
            {inviteError}
          </p>
        )}

        {/* ou compartilhe um link com código */}
        <div className="mt-3">
          {inviteUrl ? (
            <div className="flex flex-col gap-2">
              <code
                className="mono break-all rounded-xl px-3 py-2 text-sm"
                style={{ background: 'var(--app-surface-2)' }}
              >
                {inviteUrl}
              </code>
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? t('dashboard.copied') : t('dashboard.copyLink')}
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => invite.mutate()}
              disabled={invite.isPending}
            >
              {invite.isPending ? t('dashboard.generating') : t('dashboard.generateInvite')}
            </Button>
          )}
        </div>
      </Section>

      {/* atalhos */}
      <Section kicker={t('settings.data')}>
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
          <Row
            icon="bolt"
            title={t('settings.syncNow')}
            sub={t('settings.syncHint')}
            right={<Chip tone={syncState === 'error' ? 'error' : 'synced'}>{syncLabel}</Chip>}
            onClick={() => void syncNow()}
          />
          <Row icon="clock" title={t('history.title')} onClick={() => navigate({ to: '/historico' })} />
          <Row icon="chart" title={t('analytics.title')} onClick={() => navigate({ to: '/analise' })} />
          <Row icon="user" title={t('members.title')} onClick={() => navigate({ to: '/membros' })} />
          <Row icon="store" title={t('nav.stores')} onClick={() => navigate({ to: '/lojas' })} />
          <Row icon="tag" title={t('categories.title')} onClick={() => navigate({ to: '/categorias' })} />
          <Row icon="trend" title={t('activity.title')} onClick={() => navigate({ to: '/atividades' })} />
        </div>
      </Section>

      {/* dados */}
      <Section kicker={t('settings.exportData')}>
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
          <Row icon="share" title={t('settings.exportData')} sub={t('settings.exportHint')} onClick={onExport} />
          <Row
            icon="chart"
            title={t('settings.exportCsv')}
            sub={t('settings.exportCsvHint')}
            onClick={() => void exportPricesCsv()}
          />
          <Row
            icon="back"
            title={t('settings.restore')}
            sub={t('settings.restoreHint')}
            onClick={() => restoreRef.current?.click()}
          />
          <Row
            icon="alert"
            title={t('settings.deleteAccount')}
            sub={t('settings.deleteHint')}
            danger
            onClick={onDelete}
            disabled={busy}
          />
        </div>
        <input
          ref={restoreRef}
          type="file"
          accept="application/json,.json"
          onChange={onRestore}
          className="hidden"
        />
      </Section>

      {/* conta */}
      <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
        <Row icon="user" title={t('settings.privacy')} onClick={() => navigate({ to: '/privacidade' })} />
        <Row
          icon="back"
          title={t('auth.logout')}
          onClick={async () => {
            await clearLocalData();
            await signOut();
            navigate({ to: '/entrar', search: { redirect: undefined } });
          }}
        />
      </div>
    </main>
  );
}

/** Seção com kicker em cima do conteúdo. */
function Section({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="kicker" style={{ marginBottom: 8 }}>
        {kicker}
      </div>
      {children}
    </div>
  );
}

/** Linha de lista do hub: ícone + título + sub + ação à direita (chev por padrão). */
function Row({
  icon,
  title,
  sub,
  right,
  onClick,
  danger,
  disabled,
}: {
  icon: IconName;
  title: string;
  sub?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const ink = danger ? 'var(--gro-red)' : undefined;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="tap flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-50"
    >
      <Icon
        name={icon}
        size={20}
        className="flex-none"
        style={{ color: danger ? 'var(--gro-red)' : 'var(--app-gray)' }}
      />
      <div className="min-w-0 flex-1">
        <div className="font-semibold" style={ink ? { color: ink } : undefined}>
          {title}
        </div>
        {sub && <div className="muted mt-0.5 text-[12.5px]">{sub}</div>}
      </div>
      {right ?? <Icon name="chev" size={18} className="flex-none" style={{ color: 'var(--app-gray)' }} />}
    </button>
  );
}
