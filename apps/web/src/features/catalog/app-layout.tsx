import { Link, Outlet, useLocation } from '@tanstack/react-router';
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
import { Loading } from '../../pages/household-pages.js';
import { Navigate } from '@tanstack/react-router';

const NAV = [
  { to: '/', key: 'home', icon: '🏠' },
  { to: '/listas', key: 'lists', icon: '📋' },
  { to: '/itens', key: 'items', icon: '🛒' },
  { to: '/lojas', key: 'stores', icon: '🏬' },
] as const;

/** Casca das telas autenticadas: guarda sessão+casa, faz pull do catálogo, nav inferior. */
export function AppLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: session, isPending } = useSession();
  const membership = useMembership(!!session);
  const [online, setOnline] = useState(navigator.onLine);
  const pending = useLiveQuery(() => pendingCount(), [], 0);
  const syncState = useSyncExternalStore(subscribeSync, getSyncState);

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

  // Modo compra é fullscreen — sem nav inferior.
  const fullscreen = location.pathname.startsWith('/compra');

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <div className={fullscreen ? 'flex-1' : 'flex-1 pb-20'}>
        <Outlet />
      </div>
      <nav
        className={`fixed inset-x-0 bottom-0 mx-auto flex max-w-md border-t border-zinc-200 bg-white ${
          fullscreen ? 'hidden' : ''
        }`}
      >
        {NAV.map((n) => {
          const active = n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-xs font-semibold ${
                active ? 'text-green-700' : 'text-zinc-400'
              }`}
            >
              <span className="text-xl">{n.icon}</span>
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
  let cls = 'bg-zinc-900/90 text-white';
  let onClick: (() => void) | undefined;

  if (!online) {
    label = t('sync.offline');
  } else if (state === 'syncing') {
    label = t('sync.syncing');
  } else if (state === 'error') {
    label = t('sync.error');
    cls = 'bg-red-600 text-white';
    onClick = () => void syncNow();
  } else if (pending > 0) {
    label = t('sync.pending', { count: pending });
    onClick = () => void syncNow();
  } else if (showSynced) {
    label = t('sync.synced');
    cls = 'bg-green-600 text-white';
  }

  if (!label) return null;
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`fixed right-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium ${cls} ${
        onClick ? '' : 'pointer-events-none'
      }`}
    >
      {label}
    </button>
  );
}
