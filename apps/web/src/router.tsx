import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { z } from 'zod';
import { AppLayout } from './features/catalog/app-layout.js';
import { AjustesPage } from './pages/ajustes-page.js';
import { AnalyticsPage } from './pages/analytics-page.js';
import { AtividadesPage } from './pages/atividades-page.js';
import { CategoriasPage } from './pages/categorias-page.js';
import { MembrosPage } from './pages/membros-page.js';
import { CadastroPage, EntrarPage } from './pages/auth-pages.js';
import {
  EsqueciSenhaPage,
  RedefinirSenhaPage,
  VerificarEmailPage,
} from './pages/auth-recover-pages.js';
import { DashboardPage } from './pages/dashboard-page.js';
import { CasaPage, ConvitePage } from './pages/household-pages.js';
import { CompraPage } from './pages/compra-page.js';
import { ComprarReviewPage } from './pages/comprar-review-page.js';
import { HistoricoPage } from './pages/historico-page.js';
import { ImportarNotaPage } from './pages/importar-nota-page.js';
import { PrivacidadePage } from './pages/privacidade-page.js';
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
  validateSearch: z.object({ new: z.string().optional() }),
  component: CasaPage,
});
const conviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/convite/$code',
  component: ConvitePage,
});
const privacidadeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacidade',
  component: PrivacidadePage,
});
const esqueciSenhaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/esqueci-senha',
  component: EsqueciSenhaPage,
});
const redefinirSenhaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/redefinir-senha',
  validateSearch: z.object({ token: z.string().optional() }),
  component: RedefinirSenhaPage,
});
const verificarEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verificar-email',
  validateSearch: z.object({ error: z.string().optional(), token: z.string().optional() }),
  component: VerificarEmailPage,
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
const comprarReviewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/listas/$id/comprar',
  component: ComprarReviewPage,
});
const historicoRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/historico',
  component: HistoricoPage,
});
const inventarioRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/inventario',
  component: InventarioPage,
});
const compraRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/compra/$id',
  component: CompraPage,
});
const importarNotaRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/importar-nota',
  component: ImportarNotaPage,
});
const ajustesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/ajustes',
  component: AjustesPage,
});
const categoriasRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/categorias',
  component: CategoriasPage,
});
const analyticsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/analise',
  component: AnalyticsPage,
});
const membrosRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/membros',
  component: MembrosPage,
});
const atividadesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/atividades',
  component: AtividadesPage,
});

const routeTree = rootRoute.addChildren([
  entrarRoute,
  cadastroRoute,
  casaRoute,
  conviteRoute,
  privacidadeRoute,
  esqueciSenhaRoute,
  redefinirSenhaRoute,
  verificarEmailRoute,
  appLayoutRoute.addChildren([
    indexRoute,
    itensRoute,
    itemNovoRoute,
    itemEditRoute,
    lojasRoute,
    listasRoute,
    listaDetailRoute,
    comprarReviewRoute,
    historicoRoute,
    inventarioRoute,
    compraRoute,
    importarNotaRoute,
    ajustesRoute,
    categoriasRoute,
    analyticsRoute,
    membrosRoute,
    atividadesRoute,
  ]),
]);

// defaultViewTransition: cross-fade/rise nativo entre rotas (View Transitions API).
// Pseudo-elementos (::view-transition-*) são snapshots — não afetam position:fixed dos
// elementos reais, então é seguro com os FABs/rodapés fixos. Sem suporte = navega normal.
export const router = createRouter({ routeTree, defaultViewTransition: true });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
