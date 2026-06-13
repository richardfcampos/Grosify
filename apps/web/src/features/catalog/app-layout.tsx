import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pendingCount, setHouseholdId, startSync } from '../../sync/engine.js';
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

  useEffect(() => {
    if (membership.data) {
      setHouseholdId(membership.data.householdId);
      startSync();
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
      {(!online || pending > 0) && (
        <span className="pointer-events-none fixed right-3 top-3 rounded-full bg-zinc-900/90 px-2.5 py-1 text-xs font-medium text-white">
          {!online ? t('sync.offline') : t('sync.pending', { count: pending })}
        </span>
      )}
    </div>
  );
}
