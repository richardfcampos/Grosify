import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { z } from 'zod';
import { AppLayout } from './features/catalog/app-layout.js';
import { CadastroPage, EntrarPage } from './pages/auth-pages.js';
import { DashboardPage } from './pages/dashboard-page.js';
import { CasaPage, ConvitePage } from './pages/household-pages.js';
import { InventarioPage } from './pages/inventario-page.js';
import { ItemFormPage } from './pages/item-form-page.js';
import { ItensPage } from './pages/itens-page.js';
import { ListaDetailPage } from './pages/lista-detail-page.js';
import { ListasPage } from './pages/listas-page.js';
import { LojasPage } from './pages/lojas-page.js';

const redirectSearch = z.object({ redirect: z.string().startsWith('/').optional() });

const rootRoute = createRootRoute({ component: Outlet });

// rotas públicas
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

// casca autenticada com nav inferior
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppLayout,
});
const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: DashboardPage,
});
const itensRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/itens',
  component: ItensPage,
});
const itemNovoRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/itens/novo',
  component: ItemFormPage,
});
const itemEditRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/itens/$id',
  component: ItemFormPage,
});
const lojasRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/lojas',
  component: LojasPage,
});
const listasRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/listas',
  component: ListasPage,
});
const listaDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/listas/$id',
  component: ListaDetailPage,
});
const inventarioRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/inventario',
  component: InventarioPage,
});

const routeTree = rootRoute.addChildren([
  entrarRoute,
  cadastroRoute,
  casaRoute,
  conviteRoute,
  appLayoutRoute.addChildren([
    indexRoute,
    itensRoute,
    itemNovoRoute,
    itemEditRoute,
    lojasRoute,
    listasRoute,
    listaDetailRoute,
    inventarioRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
