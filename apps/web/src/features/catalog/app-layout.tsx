import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { Chip } from '@grosify/ui';
import { Icon, type IconName } from '../ui/icon.js';
import { useTheme } from '../ui/theme-provider.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deadLetterCount,
  getSyncState,
  initHousehold,
  pendingCount,
  retryDeadLetters,
  startSync,
  subscribeSync,
  syncNow,
} from '../../sync/engine.js';
import { useQueryClient } from '@tanstack/react-query';
import { sendVerificationEmail, useSession } from '../../lib/auth-client.js';
import { useMembership } from '../../lib/use-membership.js';
import { api } from '../../lib/api.js';
import { Onboarding } from '../onboarding/onboarding.js';
import { Loading } from '../../pages/household-pages.js';
import { Navigate } from '@tanstack/react-router';

/** IA do design: Início · Preços · (Comprar) · Estoque · Ajustes.
 *  Preços aponta pra /itens até a tela dedicada /precos (fase C). */
const NAV_LEFT = [
  { to: '/', key: 'home', icon: 'home' },
  { to: '/itens', key: 'prices', icon: 'tag' },
] as const satisfies readonly { to: string; key: string; icon: IconName }[];
const NAV_RIGHT = [
  { to: '/inventario', key: 'stock', icon: 'box' },
  { to: '/ajustes', key: 'settings', icon: 'gear' },
] as const satisfies readonly { to: string; key: string; icon: IconName }[];

/** Casca das telas autenticadas: guarda sessão+casa, faz pull do catálogo, nav inferior. */
export function AppLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: session, isPending } = useSession();
  const membership = useMembership(!!session);
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const pending = useLiveQuery(() => pendingCount(), [], 0);
  const dead = useLiveQuery(() => deadLetterCount(), [], 0);
  const syncState = useSyncExternalStore(subscribeSync, getSyncState);
  const [onbDone, setOnbDone] = useState(false); // marcado nesta sessão após terminar/pular

  useEffect(() => {
    if (membership.data) {
      void initHousehold(membership.data.householdId).then(startSync);
    }
  }, [membership.data]);

  // Aplica a preferência visual salva na conta (1x por sessão): outro aparelho pega
  // a escolha de tema/direção. localStorage segue como cache instantâneo (sem flash).
  const { setMode, setDir } = useTheme();
  const themeApplied = useRef(false);
  useEffect(() => {
    const m = membership.data;
    if (!m || themeApplied.current) return;
    if (m.themeMode === 'light' || m.themeMode === 'dark' || m.themeMode === 'system') setMode(m.themeMode);
    if (m.themeDir === 'painel' || m.themeDir === 'mercado' || m.themeDir === 'recibo') setDir(m.themeDir);
    themeApplied.current = true;
  }, [membership.data, setMode, setDir]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // mostra "Sincronizado ✓" por alguns segundos após um sync bem-sucedido
  const [showSynced, setShowSynced] = useState(false);
  useEffect(() => {
    if (syncState !== 'synced') {
      setShowSynced(false);
      return;
    }
    setShowSynced(true);
    const id = setTimeout(() => setShowSynced(false), 2500);
    return () => clearTimeout(id);
  }, [syncState]);

  if (isPending || (session && membership.isLoading)) return <Loading />;
  if (!session) return <Navigate to="/entrar" search={{ redirect: location.pathname }} />;
  if (!membership.data) return <Navigate to="/casa" />;

  // primeiro acesso do membro: mostra onboarding (estado persiste na conta, não no aparelho)
  if (!onbDone && !membership.data.onboarded) {
    return (
      <Onboarding
        onDone={() => {
          setOnbDone(true); // some já nesta sessão; o servidor confirma em background
          void api.households.onboarded
            .$post()
            .then(() => queryClient.invalidateQueries({ queryKey: ['membership'] }))
            .catch(() => {}); // offline: re-tenta no próximo login (degradação aceitável)
        }}
      />
    );
  }

  // Trocar de casa é a mesma rota ('/'), então a página não remonta sozinha e os
  // useLiveQuery montados seguem presos ao contexto da casa antiga (só um refresh
  // manual corrigia). Chavear pelo householdId remonta a subárvore roteada na troca,
  // relendo o Dexie já populado pelo pull da casa nova.
  const outletKey = membership.data.householdId;

  // Fluxo de compra (revisar + modo compra) é fullscreen, sem chrome: a nav inferior
  // fixa cobre/disputa o CTA fixo do rodapé ("Começar"/"Finalizar"). Cada tela tem o
  // próprio botão de voltar.
  if (location.pathname.startsWith('/compra') || location.pathname.endsWith('/comprar'))
    return <Outlet key={outletKey} />;

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <div className="flex min-h-dvh w-full">
      <Rail name={membership.data.name} plan={membership.data.plan} isActive={isActive} />
      <div className="relative flex min-h-dvh flex-1 flex-col">
        <div
          className="mx-auto w-full max-w-md flex-1 pb-24 lg:max-w-[760px] lg:pb-12"
          style={{ viewTransitionName: 'app-content' }}
        >
          <VerifyBanner email={session.user.email} verified={session.user.emailVerified} />
          <Outlet key={outletKey} />
        </div>
        <BottomNav isActive={isActive} />
      </div>
      <SyncChip
        online={online}
        state={syncState}
        pending={pending}
        dead={dead}
        showSynced={showSynced}
      />
    </div>
  );
}

/** Aviso de verificação de e-mail (SOFT): mostra até confirmar, com reenviar. Tom neutro. */
function VerifyBanner({ email, verified }: { email: string; verified: boolean }) {
  const { t } = useTranslation();
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (verified) return null;

  async function resend() {
    setBusy(true);
    try {
      await sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/verificar-email`,
      });
      setResent(true);
    } catch {
      /* offline/erro: usuário pode tentar de novo depois */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm lg:mx-0"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      <span className="muted">{t('auth.verifyBanner')}</span>
      {resent ? (
        <span className="muted flex-none text-xs">{t('auth.verifyResent')}</span>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="flex-none font-bold"
          style={{ color: 'var(--gro-green)' }}
        >
          {t('auth.verifyResend')}
        </button>
      )}
    </div>
  );
}

/** Rail lateral do desktop (≥lg): logo, navegação e rodapé com casa + plano. */
function Rail({
  name,
  plan,
  isActive,
}: {
  name: string;
  plan: 'free' | 'pro';
  isActive: (to: string) => boolean;
}) {
  const { t } = useTranslation();
  return (
    <aside
      className="sticky top-0 hidden h-dvh w-[220px] flex-none flex-col gap-1 lg:flex"
      style={{
        borderRight: '1px solid var(--app-border)',
        background: 'var(--app-surface)',
        padding: '24px 14px',
      }}
    >
      <div className="flex items-center gap-2.5" style={{ padding: '4px 10px 22px' }}>
        <span
          className="flex flex-none items-center justify-center"
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: 'var(--gro-green)',
            color: '#fff',
            fontWeight: 800,
            fontFamily: 'var(--gro-font-money)',
            fontSize: 18,
          }}
        >
          G
        </span>
        <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-.02em' }}>Grosify</span>
      </div>
      <RailLink to="/" icon="home" label={t('nav.home')} active={isActive('/')} />
      <RailLink to="/itens" icon="tag" label={t('nav.prices')} active={isActive('/itens')} />
      <RailLink to="/listas" icon="cart" label={t('nav.shop')} buy />
      <RailLink to="/inventario" icon="box" label={t('nav.stock')} active={isActive('/inventario')} />
      <RailLink to="/ajustes" icon="gear" label={t('nav.settings')} active={isActive('/ajustes')} />
      <div className="flex-1" />
      <div className="muted" style={{ fontSize: 11, padding: '0 12px' }}>
        {name} · {plan === 'pro' ? t('nav.planPro') : t('nav.planFree')}
      </div>
    </aside>
  );
}

function RailLink({
  to,
  icon,
  label,
  active,
  buy,
}: {
  to: string;
  icon: IconName;
  label: string;
  active?: boolean;
  buy?: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className="flex items-center gap-3"
      style={{
        padding: '11px 12px',
        borderRadius: 11,
        fontWeight: 600,
        fontSize: 14.5,
        textDecoration: 'none',
        background: buy
          ? 'var(--gro-green)'
          : active
            ? 'color-mix(in srgb, var(--gro-green) 14%, transparent)'
            : 'transparent',
        color: buy ? '#fff' : active ? 'var(--gro-green)' : 'var(--app-gray)',
        transition: 'background .22s var(--ease-out), color .22s var(--ease-out)',
      }}
    >
      <Icon name={icon} size={20} stroke={active || buy ? 2.1 : 1.8} /> {label}
    </Link>
  );
}

/** Nav inferior do mobile (<lg): Início · Preços · Comprar (verde) · Estoque · Ajustes. */
function BottomNav({ isActive }: { isActive: (to: string) => boolean }) {
  const { t } = useTranslation();
  return (
    <nav className="botnav fixed inset-x-0 bottom-0 mx-auto max-w-md lg:hidden">
      {NAV_LEFT.map((n) => (
        <BottomTab key={n.to} to={n.to} icon={n.icon} label={t(`nav.${n.key}`)} active={isActive(n.to)} />
      ))}
      <Link
        to="/listas"
        aria-label={t('nav.shop')}
        style={{ flex: 'none', justifyContent: 'flex-start', paddingTop: 4, color: 'var(--gro-green)' }}
      >
        <span
          style={{
            width: 50,
            height: 50,
            borderRadius: 16,
            background: 'var(--gro-green)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 16px -6px var(--gro-green)',
          }}
        >
          <Icon name="cart" size={24} stroke={2} />
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gro-green)', marginTop: 2 }}>
          {t('nav.shop')}
        </span>
      </Link>
      {NAV_RIGHT.map((n) => (
        <BottomTab key={n.to} to={n.to} icon={n.icon} label={t(`nav.${n.key}`)} active={isActive(n.to)} />
      ))}
    </nav>
  );
}

/** Aba da bottom nav com pílula verde animada atrás do ícone quando ativa. */
function BottomTab({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: IconName;
  label: string;
  active: boolean;
}) {
  return (
    <Link to={to} aria-current={active ? 'page' : undefined}>
      <span
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 46,
          height: 30,
          borderRadius: 99,
        }}
      >
        <span
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 99,
            background: 'var(--gro-green)',
            opacity: active ? 0.15 : 0,
            transform: active ? 'scale(1)' : 'scale(.6)',
            transition: 'opacity .24s var(--ease-out), transform .24s var(--ease-out)',
          }}
        />
        <Icon
          name={icon}
          size={22}
          className="ic"
          stroke={active ? 2.1 : 1.8}
          style={{ position: 'relative' }}
        />
      </span>
      {label}
    </Link>
  );
}

/** Chip de status de sync no canto: offline / sincronizando / pendentes / erro / sincronizado ✓. */
function SyncChip({
  online,
  state,
  pending,
  dead,
  showSynced,
}: {
  online: boolean;
  state: ReturnType<typeof getSyncState>;
  pending: number;
  dead: number;
  showSynced: boolean;
}) {
  const { t } = useTranslation();
  let label: string | null = null;
  let tone: 'default' | 'synced' | 'error' | 'muted' = 'default';
  let onClick: (() => void) | undefined;

  if (!online) {
    label = t('sync.offline');
    tone = 'muted';
  } else if (state === 'syncing') {
    label = t('sync.syncing');
  } else if (state === 'error') {
    label = t('sync.error');
    tone = 'error';
    onClick = () => void syncNow();
  } else if (dead > 0) {
    // fila limpa mas há mutações no dead-letter: mostra e permite reprocessar
    label = t('sync.stuck', { count: dead });
    tone = 'error';
    onClick = () => void retryDeadLetters();
  } else if (pending > 0) {
    label = t('sync.pending', { count: pending });
    onClick = () => void syncNow();
  } else if (showSynced) {
    label = t('sync.synced');
    tone = 'synced';
  }

  if (!label) return null;
  return (
    <div className="fixed right-3 top-3 z-50">
      <Chip
        tone={tone}
        role={onClick ? 'button' : undefined}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        {label}
      </Chip>
    </div>
  );
}
