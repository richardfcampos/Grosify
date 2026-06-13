import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { z } from 'zod';
import { CadastroPage, EntrarPage } from './pages/auth-pages.js';
import { DashboardPage } from './pages/dashboard-page.js';
import { CasaPage, ConvitePage } from './pages/household-pages.js';

const redirectSearch = z.object({ redirect: z.string().startsWith('/').optional() });

const rootRoute = createRootRoute({ component: Outlet });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

const entrarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entrar',
  validateSearch: redirectSearch,
  component: EntrarPage,
});

const cadastroRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cadastro',
  validateSearch: redirectSearch,
  component: CadastroPage,
});

const casaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/casa',
  component: CasaPage,
});

const conviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/convite/$code',
  component: ConvitePage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  entrarRoute,
  cadastroRoute,
  casaRoute,
  conviteRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
