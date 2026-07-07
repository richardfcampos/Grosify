# Pro Plan + Multi-Gateway Billing — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: activate it by name and follow its Execute flow and Critical Rules (per-task cycle implement→gate→atomic commit, adequacy review, Verifier no fim). If the skill cannot be activated, STOP.

**Design**: `.specs/features/pro-plan-billing/design.md`
**Status**: Done (awaiting Verifier)
**Orchestration**: Fable 5 orchestrates; 1 worker per phase (sequential, same worktree, branch `claude/angry-meitner-daa5b8`). Workers commit per task; they do NOT push/merge. Models: P1 sonnet · P2 opus · P3 opus · P4 sonnet · P5 haiku · Verifier opus.

---

## Test Coverage Matrix

> Guidelines: global CLAUDE.md (run lint/tests; no mocks to pass the build) + the existing harness. No coverage threshold configured — strong defaults.

| Code Layer | Test Type | Coverage Expectation | Location | Run Command |
|---|---|---|---|---|
| shared (plans/applyFreeCaps) | unit | all branches; 1:1 with the ACs | `apps/api/src/test/plans.test.ts` (imports @grosify/shared; shared has no runner of its own) | `pnpm --filter @grosify/api test` |
| billing port/factory/providers | unit (mocked fetch) | env combos; minor-units→reais conversion; event mapping | `apps/api/src/billing/*.test.ts` | same |
| lifecycle + gates + routes | integration (pglite) | happy + edge + error per AC; idempotency; state machine | `apps/api/src/test/*.test.ts` (db-integration pattern) | same |
| client preflight/reconciliation | unit (fake-indexeddb + fetch mock) | preflight blocks; 403 removes optimistic | `apps/web/src/**/*.test.ts` | `pnpm --filter @grosify/web test` |
| UI components/pages | none (no render harness in the repo) | typecheck + build gate | — | build gate |
| schema/migration/i18n | none | build gate | — | build gate |

## Parallelism Assessment

| Test Type | Parallel-Safe? | Isolation | Evidence |
|---|---|---|---|
| api integration | per file yes (PGlite module-level), intra-file no (TRUNCATE beforeEach) | 1 PGlite per file | `db-integration.test.ts:27-51` |
| web unit | yes | fake-indexeddb per file | `vitest.setup.ts` |

Execution is sequential per phase (same worktree) — `[P]` is only free ordering within the phase.

## Gate Check Commands

| Gate | When | Command |
|---|---|---|
| Quick-api | api-only task | `pnpm --filter @grosify/api typecheck && pnpm --filter @grosify/api test` |
| Quick-web | web-only task | `pnpm --filter @grosify/web typecheck && pnpm --filter @grosify/web test` |
| Build | end of phase / task without tests | `pnpm --filter @grosify/ui build && pnpm --filter @grosify/api typecheck && pnpm --filter @grosify/web typecheck && pnpm --filter @grosify/api test && pnpm --filter @grosify/web test` |

---

## Execution Plan

```
P1 (sonnet):  T1 → T2                       shared+schema foundation
P2 (opus):    T3 → T4 → T5                  port + asaas + lifecycle
P3 (opus):    T6 → T7 → T8                  routes + webhook + server gates
P4 (sonnet):  T9 → T10 [P] → T11 [P] → T12  client offline+UI
P5 (haiku):   T13 → T14                     i18n + state/env
Verifier (opus): post-T14, automatic
```

---

## Task Breakdown

### T1: Shared — constants, caps and prices
**What**: Reactivate `maxItems` (pro=∞, free=30); add `FREE_MAX_LISTS=2`, `FREE_MAX_MEMBERS=2`, `maxLists()`, `maxMembers()`, `PLAN_PRICES={BRL:{monthly:1290,yearly:9900},USD:{monthly:399,yearly:2900}}`, `applyFreeCaps(rows,cap,plan)` (pro→everything; free→sort id asc, slice cap).
**Where**: `packages/shared/src/plans.ts` (+ export in index if needed) · tests `apps/api/src/test/plans.test.ts`
**Depends**: none · **Requirement**: BILL-01 · **Tests**: unit · **Gate**: Quick-api
**Done when**: maxItems free=30/pro=∞; applyFreeCaps deterministic by id asc; PLAN_PRICES BRL/USD; tests 1:1 with the spec values.
**Commit**: `feat(plans): reativa limites free e adiciona caps/preços compartilhados`

### T2: Schema — subscriptions, webhook_events, planOverride
**What**: Tables per the design (§3): `subscriptions` (partial unique 1 non-terminal/household), `webhook_events` (unique provider+eventId), `households.planOverride`; migration via `pnpm --filter @grosify/api db:generate` (0026); add the 2 tables to the harness TRUNCATE.
**Where**: `apps/api/src/db/schema.ts` · `apps/api/drizzle/0026_*` · `apps/api/src/test/db-integration.test.ts` (TRUNCATE list only)
**Depends**: none · **Requirement**: BILL-02/03/06 · **Tests**: none (schema) · **Gate**: Build
**Commit**: `feat(billing): schema de assinaturas + eventos de webhook + override de plano`

### T3: PaymentProvider port + factory + Stripe stub
**What**: `types.ts` (PaymentProvider, normalized BillingEvent), `index.ts` (factory `billingProviderFor(currency)` BRL→asaas/otherwise→stripe, null without env; `setBillingProvider` for tests — mirror email/index.ts), `stripe-provider.ts` (stub throws `provider_unavailable`).
**Where**: `apps/api/src/billing/{types,index,stripe-provider}.ts` + `apps/api/src/billing/factory.test.ts`
**Depends**: T1 · **Requirement**: BILL-04 · **Tests**: unit (env combos: no env→null; BRL+ASAAS_API_KEY→asaas; USD→stripe/null) · **Gate**: Quick-api
**Commit**: `feat(billing): porta PaymentProvider com factory por moeda e stub Stripe`

### T4: Asaas adapter
**What**: `asaas-provider.ts` per design §2 (headers access_token+User-Agent; ASAAS_BASE_URL default sandbox; createSubscription = customer→subscription billingType UNDEFINED→GET payments→invoiceUrl; **value = priceCents/100**; cancel = DELETE; verifyAndParseWebhook: header `asaas-access-token`===ASAAS_WEBHOOK_TOKEN + mapping PAYMENT_CONFIRMED|RECEIVED→payment_confirmed, PAYMENT_OVERDUE→payment_overdue, PAYMENT_REFUNDED→payment_refunded, PAYMENT_CHARGEBACK_*→chargeback, SUBSCRIPTION_DELETED|INACTIVATED→subscription_deleted; others→null).
**Where**: `apps/api/src/billing/asaas-provider.ts` + `asaas-provider.test.ts` (mocked fetch)
**Depends**: T3 · **Requirement**: BILL-02 · **Tests**: unit — MANDATORY explicit test 1290→"12.90" (the design's 100x risk) + mapping of each event + webhook auth
**Gate**: Quick-api · **Commit**: `feat(billing): adapter Asaas (assinatura, cancelamento, webhook)`

### T5: Lifecycle — state machine + idempotency + lazy expiry
**What**: `lifecycle.ts`: `applyBillingEvent` (insert webhook_events ON CONFLICT no-op→skip; locate sub by externalId; transitions pending→active, active↔overdue, *→canceled; terminal ignores; syncs households.plan) · `resolveEffectivePlan(householdId)` (planOverride wins; canceled+currentPeriodEnd<now→free; overdue+7d→free; write-behind).
**Where**: `apps/api/src/billing/lifecycle.ts` + `apps/api/src/test/billing-lifecycle.test.ts` (pglite)
**Depends**: T2, T3 · **Requirement**: BILL-03/06 · **Tests**: integration — each transition from the spec (P1-lifecycle ACs), duplicate event no-op, out-of-order ignored, 7d grace, override
**Gate**: Quick-api · **Commit**: `feat(billing): ciclo de vida da assinatura com idempotência e grace`

### T6: /billing routes
**What**: `routes/billing.ts` (checkout {cycle,cpfCnpj}: role owner|admin 403, household currency, provider null→501 provider_unavailable, non-terminal sub→409 already_subscribed except pending>24h cancel-recreate, creates a pending row, returns checkoutUrl, provider error→502; GET subscription; POST cancel → currentPeriodEnd=nextDueDate) + mount in index.ts.
**Where**: `apps/api/src/routes/billing.ts` · `apps/api/src/index.ts` · `apps/api/src/test/billing-routes.test.ts`
**Depends**: T5 · **Requirement**: BILL-02/03 · **Tests**: integration with a fake provider via setBillingProvider (happy, 403 role, 409, 501, 502, pending>24h)
**Gate**: Quick-api · **Commit**: `feat(billing): rotas de checkout, status e cancelamento`

### T7: Webhook /webhooks/asaas
**What**: POST in `routes/webhooks.ts` (Resend pattern: token→401; parse failed→400; delegates to applyBillingEvent; try/catch→200 with log — the Asaas queue must not be interrupted; log {event, externalId, result}).
**Where**: `apps/api/src/routes/webhooks.ts` + `apps/api/src/test/billing-webhook.test.ts`
**Depends**: T5 · **Requirement**: BILL-02 AC4-6 · **Tests**: integration (invalid token 401 no effect; confirmed→pro; duplicate no-op; unknown 200 no effect)
**Gate**: Quick-api · **Commit**: `feat(billing): webhook Asaas com verificação e idempotência`

### T8: Server gates + effective plan
**What**: (a) membershipOf/requireHousehold use `resolveEffectivePlan` (override+lazy); (b) list gate in POST /shopping/lists (`list_limit_reached`); (c) member gate INSIDE the /join transaction (`member_limit_reached`; plan from invite.householdId) + early check in the 2 invite creates; (d) uploads presign `pro_required` 403 (after the 501 check); (e) FK→4xx in the dependent routes (inventory/movements/prices/sessions — replicate shopping.ts:167 `entry_ref_missing`); (f) best-effort cancel in the household's LGPD deletion.
**Where**: `middleware/household.ts`, `routes/{households,shopping,uploads,me}.ts` + `apps/api/src/test/plan-gates.test.ts`
**Depends**: T5 · **Requirement**: BILL-01 · **Tests**: integration — each cap (30/2/2) hit exactly + pro unlimited + FK 409
**Gate**: Build (end of phase) · **Commit**: `feat(billing): gates de plano no servidor + plan efetivo com override`

### T9: Client — offline preflight + 4xx reconciliation
**What**: (a) persist plan in `db.meta` on the membership fetch (fail-open if absent); (b) preflight in createItem/createList (Dexie count >= cap → throw `item_limit_reached`/`list_limit_reached` BEFORE the optimistic put); (c) drainOutbox: 4xx with code `*_limit_reached|pro_required` on POST → delete the optimistic row via entry.rowId (item+barcodes/list) + increment `db.meta.rejectedByPlan`; other 4xx keep current behavior.
**Where**: `apps/web/src/db/repositories.ts`, `apps/web/src/sync/engine.ts`, `apps/web/src/lib/use-membership.ts` + tests `apps/web/src/sync/plan-gates.test.ts`
**Depends**: T1 · **Requirement**: BILL-01 AC1-3 (offline) · **Tests**: unit (preflight blocks at the cap; 403 removes optimistic; counter increments)
**Gate**: Quick-web · **Commit**: `feat(web): preflight de limites offline + reconciliação de rejeição por plano`

### T10: Client — read filter + "N hidden" warning [P]
**What**: `applyFreeCaps` on the catalog surfaces (itens-page, dashboard, listas-page); `useHiddenCounts()` hook (total − visible: items/lists/prices>90d); persistent banner "N items hidden — Pro reveals them" with a CTA → /ajustes; apply `historyCutoff` in check-item-sheet (the design §Risks inconsistency).
**Where**: `apps/web/src/pages/{itens,dashboard,listas}-page.tsx`, new `apps/web/src/lib/use-hidden-counts.ts`, new banner component, `features/shopping/check-item-sheet.tsx`
**Depends**: T1 · **Requirement**: BILL-01 AC6-7 · **Tests**: none (UI; pure logic already tested in T1) · **Gate**: Quick-web (typecheck)
**Commit**: `feat(web): filtro de leitura free com aviso de dados ocultos`

### T11: Client — PaywallSheet + photo/analytics/CSV gates [P]
**What**: reusable `PaywallSheet` (gro-sheet-*); photo-capture gate (item-form :199, compra-page :724 — free→sheet); the photo sweep skips when free; analytics-page full-page upsell for free + print button; exportPricesCsv → sheet. LGPD JSON export untouched.
**Where**: new `apps/web/src/features/billing/paywall-sheet.tsx`, `pages/{item-form,compra,analytics,ajustes}-page.tsx`, `sync/engine.ts` (sweep), `lib/backup.ts` untouched (gate at the caller)
**Depends**: T1 · **Requirement**: BILL-01 AC4 · **Tests**: none (UI) · **Gate**: Quick-web (typecheck)
**Commit**: `feat(web): paywall Pro em fotos, analytics e export`

### T12: Client — PlanSection in Settings
**What**: Replace the dead CTA (ajustes :251-272): free→comparison, formatted PLAN_PRICES prices, CPF/CNPJ field, monthly/yearly buttons→POST checkout→redirect checkoutUrl, inline errors (501/502/409); pro→status/cycle/next charge/cancel with useConfirm; focus-refetch + invalidate ['membership'] on return.
**Where**: `apps/web/src/pages/ajustes-page.tsx` (+ subcomponent if >200 lines)
**Depends**: T6, T11 · **Requirement**: BILL-05 · **Tests**: none (UI) · **Gate**: Build (end of phase)
**Commit**: `feat(web): assinatura Pro em Ajustes (checkout, status, cancelamento)`

### T13: i18n — 6 locales
**What**: New `billing.*` keys (plans/prices/checkout/cancel/hidden-banner/paywall) and `errors.*` (`list_limit_reached`, `member_limit_reached`, `pro_required`, `already_subscribed`, `provider_unavailable`, `provider_error`) in pt (source) + en/es/it/de/fr — identical structure across the 6.
**Where**: `apps/web/src/i18n/locales/{pt,en,es,it,de,fr}.ts`
**Depends**: T10-T12 (keys used) · **Requirement**: BILL-05 AC · **Tests**: none · **Gate**: Quick-web (typecheck catches a missing key if typed; otherwise build)
**Commit**: `feat(i18n): strings de billing e paywall nos 6 idiomas`

### T14: State + env
**What**: (a) STATE.md: 2026-07-05 decision line — billing Asaas+Stripe stub supersedes Mercado Pago (2026-06-13), free gates, prices, downgrade filter+warning; (b) `.env.example` + `apps/api/.env.example`: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL` commented out; (c) mark tasks done in this file.
**Where**: `.specs/project/STATE.md`, `.env.example`, `apps/api/.env.example`, this file
**Depends**: T1-T13 · **Requirement**: — · **Tests**: none · **Gate**: Final build
**Commit**: `feat(state): registra decisão de billing Asaas + env de exemplo`

---

## Diagram-Definition Cross-Check

| Task | Depends (body) | Diagram | Status |
|---|---|---|---|
| T1/T2 | none | P1 start | ✅ |
| T3 | T1 | P2 after P1 | ✅ |
| T4 | T3 | T3→T4 | ✅ |
| T5 | T2,T3 | P2 (T2 in P1 ✓) | ✅ |
| T6/T7 | T5 | P3 after P2 | ✅ |
| T8 | T5 | P3 | ✅ |
| T9 | T1 | P4 | ✅ |
| T10/T11 | T1 | P4 [P] with no dependency between them | ✅ |
| T12 | T6,T11 | P4 last | ✅ |
| T13 | T10-12 | P5 | ✅ |
| T14 | T1-13 | P5 last | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix requires | Task says | Status |
|---|---|---|---|---|
| T1 | shared logic | unit | unit | ✅ |
| T2 | schema | none | none (Build) | ✅ |
| T3/T4 | billing unit | unit | unit | ✅ |
| T5 | lifecycle | integration | integration | ✅ |
| T6/T7/T8 | routes | integration | integration | ✅ |
| T9 | client logic | unit | unit | ✅ |
| T10/T11/T12 | UI | none (no render harness) | none + typecheck | ✅ |
| T13/T14 | i18n/config | none | none | ✅ |

## Task status

- [x] T1 (3945a01) · [x] T2 (914d88b) · [x] T3 (71ea1af) · [x] T4 (a850594) · [x] T5 (843f772) · [x] T6 (2a473ab) · [x] T7 (b6c3a27) · [x] T8 (7b2bb36) · [x] T9 (7cd288f) · [x] T10 (050f039) · [x] T11 (163a89f) · [x] T12 (1974a23) · [x] T13 (766df85) · [x] T14 (this worker's T14 commit)

> F4: new billing./errors. keys in pt with real text; en/es/it/de/fr with English placeholder (T13 translates). PlanSection extracted into plan-section/plan-checkout-form/plan-status-card (<200 lines each).

> F2 validated by a dedicated Verifier: PASS, sensor 4/4 mutants killed (cents conversion, grace boundary, idempotency, webhook auth) — validation.md.
> F3 deviation (T7, correct): the webhook token is re-checked in the handler (verifyAndParseWebhook conflates a bad token with an unmapped event) to distinguish 401 from 200.

> F1 deviation: `PRO_PRICE_CENTS` removed (replaced by PLAN_PRICES; zero uses confirmed).
> F2: gate re-verified by the orchestrator (worker reported out of format): typecheck ok, 108 api tests green.
