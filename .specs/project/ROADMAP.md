# Roadmap

Cada fase pequena, shippável, termina deployada.

| # | Fase | Escopo | Status |
|---|------|--------|--------|
| 0 | Walking skeleton | Monorepo, Hono `/health` (Railway), PWA shell (CF Pages), Neon+Drizzle migration #1, Better Auth, households+convites `/convite/{code}`, CI | Em andamento |
| 1 | Catálogo | CRUD itens (foto R2, múltiplos barcodes), lojas, scanner web (BarcodeDetector → ZXing → manual). Todo acesso a dados via repository layer sobre Dexie desde já | Pendente |
| 2 | Preços + lista | Registro/histórico de preço, loja-mais-barata, alerta de aumento, lista recorrente, inventário, needed qty, total estimado. Alpha com família | Pendente |
| 3 | Sync offline | Outbox, push/pull, LWW, bootstrap, Workbox precache, UI status sync. Antes do modo compra (mercado = ambiente offline) | Pendente |
| 4 | Modo compra — **lançamento MVP** | Sessão da lista necessária, scan-pra-marcar, preço real → price_record, aviso preço-mudou, "tem mais barato", total corrente vs estimado. 100% offline | Pendente |
| 5 | Billing | Stripe Checkout/portal/webhooks, enforcement no sync-push, filtro 90 dias. Verificar Pix recorrente antes | Pendente |
| 6 | Polish + lançamento público | Onboarding (seed itens pt-BR), alertas in-app, empty states, LGPD (privacy, export/delete) | Pendente |
| 7 | App Expo | apps/mobile reusa shared/sync/api-client, expo-camera, Better Auth Expo plugin, RevenueCat | Pendente |

**Transversal toda fase:** Zod em todo input, middleware household-scope, rate limit, cookies httpOnly/Secure/SameSite=Lax, bucket privado presigned, Drizzle parametrizado.

Plano completo: `~/.claude/plans/quero-um-app-tanto-glimmering-glade.md` (cópia das decisões em STATE.md).
