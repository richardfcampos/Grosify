import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pullCatalog, pullShopping } from '../../db/repositories.js';
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
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (membership.data) {
      Promise.all([pullCatalog(), pullShopping()]).finally(() => setSynced(true));
    }
  }, [membership.data]);

  if (isPending || (session && membership.isLoading)) return <Loading />;
  if (!session) return <Navigate to="/entrar" search={{ redirect: location.pathname }} />;
  if (!membership.data) return <Navigate to="/casa" />;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <div className="flex-1 pb-20">
        <Outlet />
      </div>
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md border-t border-zinc-200 bg-white">
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
      {!synced && (
        <span className="pointer-events-none fixed right-3 top-3 text-xs text-zinc-400">
          {t('common.loading')}
        </span>
      )}
    </div>
  );
}
