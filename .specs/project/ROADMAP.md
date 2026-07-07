# Roadmap

Each phase small, shippable, ends deployed.

| # | Phase | Scope | Status |
|---|------|--------|--------|
| 0 | Walking skeleton | Monorepo, Hono `/health` (Railway), PWA shell (CF Pages), Neon+Drizzle migration #1, Better Auth, households+invites `/convite/{code}`, CI | ✅ Code ready and verified locally — only deploy remaining (awaiting Railway/Neon/CF credentials) |
| 1 | Catalog | Item CRUD (R2 photo, multiple barcodes), stores, web scanner (BarcodeDetector → ZXing → manual). All data access via repository layer over Dexie from the start | ✅ Ready and verified (E2E). Photo is local-only in Dexie until R2 (no credential); upload to R2 waits for deploy/sync |
| 2 | Prices + list | Price recording/history, cheapest-store, price-increase alert, **multiple lists** (recurring/one-off), inventory, needed qty, estimated total | ✅ Ready and verified (E2E: total recalculates via cheapest store, price-increase alert, needed qty) |
| 3 | Offline sync | Local-first outbox, incremental cursor-based pull with tombstones, idempotent replay, status UI, Workbox precache | ✅ Ready and verified (E2E: create offline→optimistic+pending→reconnect→pushes without duplicating; tombstone propagates on pull) |
| 4 | Shopping mode — **MVP launch** | Required-list session, scan-to-check, real price → price_record, price-changed warning, "it's cheaper elsewhere", running total vs. estimate. 100% offline | ✅ Ready and verified (E2E: needed-qty 5, estimate R$136, bought R$26 → cart R$130, stamp, "saved R$6"). **Functional MVP** |
| 5 | Billing | **Provider: Asaas (BR) + Stripe international stub** — supersedes Mercado Pago (decision 2026-07-05). `PaymentProvider` port (strategy/DI, same pattern as email), Free gates (2 members/30 items/2 lists/90d) vs. Pro (unlimited+photos+alerts+analytics+export), R$ 12,90/month · R$ 99/year, downgrade = read filter + "N hidden" notice. Spec/design in `.specs/features/pro-plan-billing/` | Design approved in review · Tasks next |
| 6 | Polish + public launch | Settings screen, LGPD (JSON export + delete account/household), pt-BR common-items seed, in-app price alerts, **shareable receipt (WhatsApp/Web Share)**, **privacy policy** | ✅ Ready and verified. **Security bug fixed**: cross-account leak in Dexie (initHousehold clears cache on switch). App alpha-ready |
| 7 | Expo app | apps/mobile reuses shared/sync/api-client, expo-camera, Better Auth Expo plugin, RevenueCat | Pending |
| 8 | **AI phase (post-billing)** — Pro bets | **8a. NFC-e import + normalization via embeddings** (Pro killer feature: receipt QR → items+prices+store imported; embeddings match "ARROZ TP1 5KG CAMIL" with the "Arroz" item in the catalog). **8b. Natural-language list** ("barbecue for 10 people" → list with qtys). Other candidates under discussion (see STATE.md once decided) | Sequence decided 2026-07-05 · specs after billing |

**Cross-cutting across every phase:** Zod on every input, household-scope middleware, rate limit, httpOnly/Secure/SameSite=Lax cookies, private presigned bucket, parameterized Drizzle.

Full plan: `~/.claude/plans/quero-um-app-tanto-glimmering-glade.md` (copy of decisions in STATE.md).
