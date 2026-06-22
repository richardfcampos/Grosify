import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { Chip } from '@grosify/ui';
import { Icon, type IconName } from '../ui/icon.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getSyncState,
  initHousehold,
  pendingCount,
  startSync,
  subscribeSync,
  syncNow,
} from '../../sync/engine.js';
import { useSession } from '../../lib/auth-client.js';
import { useMembership } from '../../lib/use-membership.js';
import { isOnboardingDone } from '../../lib/onboarding.js';
import { Onboarding } from '../onboarding/onboarding.js';
import { Loading } from '../../pages/household-pages.js';
import { Navigate } from '@tanstack/react-router';

const NAV = [
  { to: '/', key: 'home', icon: 'home' },
  { to: '/listas', key: 'lists', icon: 'list' },
  { to: '/itens', key: 'items', icon: 'box' },
  { to: '/lojas', key: 'stores', icon: 'store' },
] as const satisfies readonly { to: string; key: string; icon: IconName }[];

/** Casca das telas autenticadas: guarda sessão+casa, faz pull do catálogo, nav inferior. */
export function AppLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: session, isPending } = useSession();
  const membership = useMembership(!!session);
  const [online, setOnline] = useState(navigator.onLine);
  const pending = useLiveQuery(() => pendingCount(), [], 0);
  const syncState = useSyncExternalStore(subscribeSync, getSyncState);
  const [onbDone, setOnbDone] = useState(false); // marcado nesta sessão após terminar/pular

  useEffect(() => {
    if (membership.data) {
      void initHousehold(membership.data.householdId).then(startSync);
    }
  }, [membership.data]);

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

  // primeira execução nesta casa/dispositivo: mostra onboarding antes do app
  if (!onbDone && !isOnboardingDone(membership.data.householdId)) {
    return (
      <Onboarding householdId={membership.data.householdId} onDone={() => setOnbDone(true)} />
    );
  }

  // Modo compra é fullscreen — sem nav inferior.
  const fullscreen = location.pathname.startsWith('/compra');

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <div className={fullscreen ? 'flex-1' : 'flex-1 pb-20'}>
        <Outlet />
      </div>
      <nav className={`botnav fixed inset-x-0 bottom-0 mx-auto max-w-md ${fullscreen ? 'hidden' : ''}`}>
        {NAV.slice(0, 2).map((n) => {
          const active = n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to);
          return (
            <Link key={n.to} to={n.to} aria-current={active}>
              <Icon name={n.icon} size={23} className="ic" stroke={active ? 2.1 : 1.8} />
              {t(`nav.${n.key}`)}
            </Link>
          );
        })}
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
        {NAV.slice(2).map((n) => {
          const active = location.pathname.startsWith(n.to);
          return (
            <Link key={n.to} to={n.to} aria-current={active}>
              <Icon name={n.icon} size={23} className="ic" stroke={active ? 2.1 : 1.8} />
              {t(`nav.${n.key}`)}
            </Link>
          );
        })}
      </nav>
      <SyncChip
        online={online}
        state={syncState}
        pending={pending}
        showSynced={showSynced}
      />
    </div>
  );
}

/** Chip de status de sync no canto: offline / sincronizando / pendentes / erro / sincronizado ✓. */
function SyncChip({
  online,
  state,
  pending,
  showSynced,
}: {
  online: boolean;
  state: ReturnType<typeof getSyncState>;
  pending: number;
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
