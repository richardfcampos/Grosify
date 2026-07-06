# Roadmap

Cada fase pequena, shippável, termina deployada.

| # | Fase | Escopo | Status |
|---|------|--------|--------|
| 0 | Walking skeleton | Monorepo, Hono `/health` (Railway), PWA shell (CF Pages), Neon+Drizzle migration #1, Better Auth, households+convites `/convite/{code}`, CI | ✅ Código pronto e verificado local — falta só deploy (aguarda credenciais Railway/Neon/CF) |
| 1 | Catálogo | CRUD itens (foto R2, múltiplos barcodes), lojas, scanner web (BarcodeDetector → ZXing → manual). Todo acesso a dados via repository layer sobre Dexie desde já | ✅ Pronto e verificado (E2E). Foto é local-only no Dexie até R2 (sem credencial); upload pro R2 fica pra quando deploy/sync |
| 2 | Preços + lista | Registro/histórico de preço, loja-mais-barata, alerta de aumento, **múltiplas listas** (recorrente/avulsa), inventário, needed qty, total estimado | ✅ Pronto e verificado (E2E: total recalcula via loja mais barata, alerta de aumento, needed qty) |
| 3 | Sync offline | Outbox local-first, pull incremental por cursor com tombstones, replay idempotente, status UI, Workbox precache | ✅ Pronto e verificado (E2E: criar offline→otimista+pendente→reconectar→sobe sem duplicar; tombstone propaga no pull) |
| 4 | Modo compra — **lançamento MVP** | Sessão da lista necessária, scan-pra-marcar, preço real → price_record, aviso preço-mudou, "tem mais barato", total corrente vs estimado. 100% offline | ✅ Pronto e verificado (E2E: needed-qty 5, estimado R$136, comprou R$26 → carrinho R$130, carimbo, "saved R$6"). **MVP funcional** |
| 5 | Billing | **Provedor: Asaas (BR) + Stripe stub internacional** — supersede Mercado Pago (decisão 2026-07-05). Porta `PaymentProvider` (strategy/DI, padrão do e-mail), gates Free (2 membros/30 itens/2 listas/90d) vs Pro (ilimitado+fotos+alertas+analytics+export), R$ 12,90/mês · R$ 99/ano, downgrade = filtro de leitura + aviso "N ocultos". Spec/design em `.specs/features/pro-plan-billing/` | ✅ Entregue (PR #20, mergeado 2026-07-05). Env-gated: aguarda credenciais Asaas do dono (checklist operacional) |
| 6 | Polish + lançamento público | Tela Ajustes, LGPD (export JSON + excluir conta/casa), seed de itens comuns pt-BR, alertas in-app de preço, **recibo compartilhável (WhatsApp/Web Share)**, **política de privacidade** | ✅ Pronto e verificado. **Bug de segurança corrigido**: vazamento entre contas no Dexie (initHousehold limpa cache na troca). App alpha-ready |
| 7 | App Expo | apps/mobile reusa shared/sync/api-client, expo-camera, Better Auth Expo plugin, RevenueCat | Pendente |
| 8 | **Fase IA (pós-billing)** — bets Pro | **8a. NFC-e import + normalização por embeddings** (killer feature Pro: QR da nota → itens+preços+loja importados; embeddings casam "ARROZ TP1 5KG CAMIL" com o item "Arroz" do catálogo). **8b. Lista por linguagem natural** ("churrasco pra 10 pessoas" → lista com qtys). Demais candidatas em discussão (ver STATE.md quando decidido) | 8a ✅ Entregue (PR #21, mergeado 2026-07-06; Verifier PASS 34/34 ACs, sensor 7/7). Env-gated: Gemini/Infosimples no checklist. 8b pendente |

**Transversal toda fase:** Zod em todo input, middleware household-scope, rate limit, cookies httpOnly/Secure/SameSite=Lax, bucket privado presigned, Drizzle parametrizado.

Plano completo: `~/.claude/plans/quero-um-app-tanto-glimmering-glade.md` (cópia das decisões em STATE.md).
