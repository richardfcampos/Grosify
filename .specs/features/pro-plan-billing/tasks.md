# Pro Plan + Multi-Gateway Billing — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: activate it by name and follow its Execute flow and Critical Rules (per-task cycle implement→gate→atomic commit, adequacy review, Verifier no fim). If the skill cannot be activated, STOP.

**Design**: `.specs/features/pro-plan-billing/design.md`
**Status**: Done (aguardando Verifier)
**Orquestração**: Fable 5 orquestra; 1 worker por fase (sequencial, mesmo worktree, branch `claude/angry-meitner-daa5b8`). Workers commitam por task; NÃO fazem push/merge. Modelos: P1 sonnet · P2 opus · P3 opus · P4 sonnet · P5 haiku · Verifier opus.

---

## Test Coverage Matrix

> Guidelines: CLAUDE.md global (rodar lint/testes; sem mocks pra passar build) + harness existente. Sem threshold de coverage configurado — strong defaults.

| Code Layer | Test Type | Coverage Expectation | Location | Run Command |
|---|---|---|---|---|
| shared (plans/applyFreeCaps) | unit | todas as branches; 1:1 com ACs | `apps/api/src/test/plans.test.ts` (importa @grosify/shared; shared não tem runner próprio) | `pnpm --filter @grosify/api test` |
| billing port/factory/providers | unit (fetch mockado) | env combos; conversão cents→reais; mapping eventos | `apps/api/src/billing/*.test.ts` | idem |
| lifecycle + gates + rotas | integration (pglite) | happy + edge + erro por AC; idempotência; máquina de estados | `apps/api/src/test/*.test.ts` (padrão db-integration) | idem |
| client preflight/reconciliação | unit (fake-indexeddb + fetch mock) | preflight bloqueia; 403 remove otimista | `apps/web/src/**/*.test.ts` | `pnpm --filter @grosify/web test` |
| UI components/pages | none (sem harness de render no repo) | typecheck + build gate | — | build gate |
| schema/migração/i18n | none | build gate | — | build gate |

## Parallelism Assessment

| Test Type | Parallel-Safe? | Isolation | Evidence |
|---|---|---|---|
| api integration | por arquivo sim (PGlite module-level), intra-arquivo não (TRUNCATE beforeEach) | 1 PGlite por arquivo | `db-integration.test.ts:27-51` |
| web unit | sim | fake-indexeddb por arquivo | `vitest.setup.ts` |

Execução é sequencial por fase (mesmo worktree) — `[P]` é só ordem-livre dentro da fase.

## Gate Check Commands

| Gate | Quando | Command |
|---|---|---|
| Quick-api | task só api | `pnpm --filter @grosify/api typecheck && pnpm --filter @grosify/api test` |
| Quick-web | task só web | `pnpm --filter @grosify/web typecheck && pnpm --filter @grosify/web test` |
| Build | fim de fase / task sem teste | `pnpm --filter @grosify/ui build && pnpm --filter @grosify/api typecheck && pnpm --filter @grosify/web typecheck && pnpm --filter @grosify/api test && pnpm --filter @grosify/web test` |

---

## Execution Plan

```
P1 (sonnet):  T1 → T2                       fundação shared+schema
P2 (opus):    T3 → T4 → T5                  porta + asaas + lifecycle
P3 (opus):    T6 → T7 → T8                  rotas + webhook + gates server
P4 (sonnet):  T9 → T10 [P] → T11 [P] → T12  client offline+UI
P5 (haiku):   T13 → T14                     i18n + estado/env
Verifier (opus): pós-T14, automático
```

---

## Task Breakdown

### T1: Shared — constantes, caps e preços
**What**: Reativar `maxItems` (pro=∞, free=30); add `FREE_MAX_LISTS=2`, `FREE_MAX_MEMBERS=2`, `maxLists()`, `maxMembers()`, `PLAN_PRICES={BRL:{monthly:1290,yearly:9900},USD:{monthly:399,yearly:2900}}`, `applyFreeCaps(rows,cap,plan)` (pro→tudo; free→sort id asc, slice cap).
**Where**: `packages/shared/src/plans.ts` (+ export em index se preciso) · testes `apps/api/src/test/plans.test.ts`
**Depends**: none · **Requirement**: BILL-01 · **Tests**: unit · **Gate**: Quick-api
**Done when**: maxItems free=30/pro=∞; applyFreeCaps determinístico por id asc; PLAN_PRICES BRL/USD; testes 1:1 com valores do spec.
**Commit**: `feat(plans): reativa limites free e adiciona caps/preços compartilhados`

### T2: Schema — subscriptions, webhook_events, planOverride
**What**: Tabelas conforme design (§3): `subscriptions` (unique parcial 1 não-terminal/household), `webhook_events` (unique provider+eventId), `households.planOverride`; migração via `pnpm --filter @grosify/api db:generate` (0026); adicionar as 2 tabelas ao TRUNCATE do harness.
**Where**: `apps/api/src/db/schema.ts` · `apps/api/drizzle/0026_*` · `apps/api/src/test/db-integration.test.ts` (só TRUNCATE list)
**Depends**: none · **Requirement**: BILL-02/03/06 · **Tests**: none (schema) · **Gate**: Build
**Commit**: `feat(billing): schema de assinaturas + eventos de webhook + override de plano`

### T3: Porta PaymentProvider + factory + Stripe stub
**What**: `types.ts` (PaymentProvider, BillingEvent normalizado), `index.ts` (factory `billingProviderFor(currency)` BRL→asaas/senão→stripe, null sem env; `setBillingProvider` p/ testes — espelhar email/index.ts), `stripe-provider.ts` (stub lança `provider_unavailable`).
**Where**: `apps/api/src/billing/{types,index,stripe-provider}.ts` + `apps/api/src/billing/factory.test.ts`
**Depends**: T1 · **Requirement**: BILL-04 · **Tests**: unit (env combos: sem env→null; BRL+ASAAS_API_KEY→asaas; USD→stripe/null) · **Gate**: Quick-api
**Commit**: `feat(billing): porta PaymentProvider com factory por moeda e stub Stripe`

### T4: Adapter Asaas
**What**: `asaas-provider.ts` conforme design §2 (headers access_token+User-Agent; ASAAS_BASE_URL default sandbox; createSubscription = customer→subscription billingType UNDEFINED→GET payments→invoiceUrl; **value = priceCents/100**; cancel = DELETE; verifyAndParseWebhook: header `asaas-access-token`===ASAAS_WEBHOOK_TOKEN + mapping PAYMENT_CONFIRMED|RECEIVED→payment_confirmed, PAYMENT_OVERDUE→payment_overdue, PAYMENT_REFUNDED→payment_refunded, PAYMENT_CHARGEBACK_*→chargeback, SUBSCRIPTION_DELETED|INACTIVATED→subscription_deleted; demais→null).
**Where**: `apps/api/src/billing/asaas-provider.ts` + `asaas-provider.test.ts` (fetch mockado)
**Depends**: T3 · **Requirement**: BILL-02 · **Tests**: unit — OBRIGATÓRIO teste explícito 1290→"12.90" (risco 100x do design) + mapping de cada evento + auth de webhook
**Gate**: Quick-api · **Commit**: `feat(billing): adapter Asaas (assinatura, cancelamento, webhook)`

### T5: Lifecycle — máquina de estados + idempotência + lazy expiry
**What**: `lifecycle.ts`: `applyBillingEvent` (insert webhook_events ON CONFLICT no-op→skip; localizar sub por externalId; transições pending→active, active↔overdue, *→canceled; terminal ignora; sincroniza households.plan) · `resolveEffectivePlan(householdId)` (planOverride vence; canceled+currentPeriodEnd<now→free; overdue+7d→free; write-behind).
**Where**: `apps/api/src/billing/lifecycle.ts` + `apps/api/src/test/billing-lifecycle.test.ts` (pglite)
**Depends**: T2, T3 · **Requirement**: BILL-03/06 · **Tests**: integration — cada transição do spec (P1-lifecycle ACs), evento duplicado no-op, out-of-order ignorado, grace 7d, override
**Gate**: Quick-api · **Commit**: `feat(billing): ciclo de vida da assinatura com idempotência e grace`

### T6: Rotas /billing
**What**: `routes/billing.ts` (checkout {cycle,cpfCnpj}: role owner|admin 403, moeda do household, provider null→501 provider_unavailable, sub não-terminal→409 already_subscribed exceto pending>24h cancela-recria, cria linha pending, retorna checkoutUrl, erro provider→502; GET subscription; POST cancel → currentPeriodEnd=nextDueDate) + mount em index.ts.
**Where**: `apps/api/src/routes/billing.ts` · `apps/api/src/index.ts` · `apps/api/src/test/billing-routes.test.ts`
**Depends**: T5 · **Requirement**: BILL-02/03 · **Tests**: integration com fake provider via setBillingProvider (happy, 403 role, 409, 501, 502, pending>24h)
**Gate**: Quick-api · **Commit**: `feat(billing): rotas de checkout, status e cancelamento`

### T7: Webhook /webhooks/asaas
**What**: POST no `routes/webhooks.ts` (padrão Resend: token→401; parse falhou→400; delega applyBillingEvent; try/catch→200 com log — fila Asaas não pode interromper; log {event, externalId, resultado}).
**Where**: `apps/api/src/routes/webhooks.ts` + `apps/api/src/test/billing-webhook.test.ts`
**Depends**: T5 · **Requirement**: BILL-02 AC4-6 · **Tests**: integration (token inválido 401 sem efeito; confirmado→pro; duplicado no-op; desconhecido 200 sem efeito)
**Gate**: Quick-api · **Commit**: `feat(billing): webhook Asaas com verificação e idempotência`

### T8: Gates server + plan efetivo
**What**: (a) membershipOf/requireHousehold usam `resolveEffectivePlan` (override+lazy); (b) gate listas em POST /shopping/lists (`list_limit_reached`); (c) gate membros DENTRO da transação do /join (`member_limit_reached`; plan do invite.householdId) + check antecipado nos 2 creates de convite; (d) uploads presign `pro_required` 403 (após check 501); (e) FK→4xx nas rotas dependentes (inventory/movements/prices/sessions — replicar shopping.ts:167 `entry_ref_missing`); (f) cancel best-effort na exclusão LGPD do household.
**Where**: `middleware/household.ts`, `routes/{households,shopping,uploads,me}.ts` + `apps/api/src/test/plan-gates.test.ts`
**Depends**: T5 · **Requirement**: BILL-01 · **Tests**: integration — cada teto (30/2/2) hit exato + pro ilimitado + FK 409
**Gate**: Build (fim de fase) · **Commit**: `feat(billing): gates de plano no servidor + plan efetivo com override`

### T9: Client — preflight offline + reconciliação 4xx
**What**: (a) persistir plan em `db.meta` no fetch de membership (fail-open se ausente); (b) preflight em createItem/createList (count Dexie >= cap → throw `item_limit_reached`/`list_limit_reached` ANTES do put otimista); (c) drainOutbox: 4xx com código `*_limit_reached|pro_required` em POST → deletar linha otimista via entry.rowId (item+barcodes/lista) + incrementar `db.meta.rejectedByPlan`; demais 4xx comportamento atual.
**Where**: `apps/web/src/db/repositories.ts`, `apps/web/src/sync/engine.ts`, `apps/web/src/lib/use-membership.ts` + testes `apps/web/src/sync/plan-gates.test.ts`
**Depends**: T1 · **Requirement**: BILL-01 AC1-3 (offline) · **Tests**: unit (preflight bloqueia no cap; 403 remove otimista; contador incrementa)
**Gate**: Quick-web · **Commit**: `feat(web): preflight de limites offline + reconciliação de rejeição por plano`

### T10: Client — filtro de leitura + aviso "N ocultos" [P]
**What**: `applyFreeCaps` nas superfícies de catálogo (itens-page, dashboard, listas-page); hook `useHiddenCounts()` (total − visível: itens/listas/preços>90d); banner persistente "N itens ocultos — o Pro revela" com CTA → /ajustes; aplicar `historyCutoff` no check-item-sheet (inconsistência do design §Risks).
**Where**: `apps/web/src/pages/{itens,dashboard,listas}-page.tsx`, novo `apps/web/src/lib/use-hidden-counts.ts`, novo banner component, `features/shopping/check-item-sheet.tsx`
**Depends**: T1 · **Requirement**: BILL-01 AC6-7 · **Tests**: none (UI; lógica pura já testada em T1) · **Gate**: Quick-web (typecheck)
**Commit**: `feat(web): filtro de leitura free com aviso de dados ocultos`

### T11: Client — PaywallSheet + gates fotos/analytics/CSV [P]
**What**: `PaywallSheet` reutilizável (gro-sheet-*); gate captura de foto (item-form :199, compra-page :724 — free→sheet); sweep de fotos pula quando free; analytics-page upsell full-page free + botão print; exportPricesCsv → sheet. Export JSON LGPD intocado.
**Where**: novo `apps/web/src/features/billing/paywall-sheet.tsx`, `pages/{item-form,compra,analytics,ajustes}-page.tsx`, `sync/engine.ts` (sweep), `lib/backup.ts` intocado (gate no caller)
**Depends**: T1 · **Requirement**: BILL-01 AC4 · **Tests**: none (UI) · **Gate**: Quick-web (typecheck)
**Commit**: `feat(web): paywall Pro em fotos, analytics e export`

### T12: Client — PlanSection em Ajustes
**What**: Substituir CTA morto (ajustes :251-272): free→comparativo, preços PLAN_PRICES formatados, campo CPF/CNPJ, botões mensal/anual→POST checkout→redirect checkoutUrl, erros inline (501/502/409); pro→status/ciclo/próxima cobrança/cancelar com useConfirm; focus-refetch + invalidate ['membership'] no retorno.
**Where**: `apps/web/src/pages/ajustes-page.tsx` (+ subcomponente se >200 linhas)
**Depends**: T6, T11 · **Requirement**: BILL-05 · **Tests**: none (UI) · **Gate**: Build (fim de fase)
**Commit**: `feat(web): assinatura Pro em Ajustes (checkout, status, cancelamento)`

### T13: i18n — 6 locales
**What**: Novas chaves `billing.*` (planos/preços/checkout/cancel/hidden-banner/paywall) e `errors.*` (`list_limit_reached`, `member_limit_reached`, `pro_required`, `already_subscribed`, `provider_unavailable`, `provider_error`) em pt (fonte) + en/es/it/de/fr — estrutura idêntica nos 6.
**Where**: `apps/web/src/i18n/locales/{pt,en,es,it,de,fr}.ts`
**Depends**: T10-T12 (chaves usadas) · **Requirement**: BILL-05 AC · **Tests**: none · **Gate**: Quick-web (typecheck pega chave faltando se tipado; senão build)
**Commit**: `feat(i18n): strings de billing e paywall nos 6 idiomas`

### T14: Estado + env
**What**: (a) STATE.md: linha de decisão 2026-07-05 — billing Asaas+Stripe stub supersede Mercado Pago (2026-06-13), gates free, preços, downgrade filtro+aviso; (b) `.env.example` + `apps/api/.env.example`: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL` comentadas; (c) marcar tasks done neste arquivo.
**Where**: `.specs/project/STATE.md`, `.env.example`, `apps/api/.env.example`, este arquivo
**Depends**: T1-T13 · **Requirement**: — · **Tests**: none · **Gate**: Build final
**Commit**: `feat(state): registra decisão de billing Asaas + env de exemplo`

---

## Diagram-Definition Cross-Check

| Task | Depends (body) | Diagrama | Status |
|---|---|---|---|
| T1/T2 | none | P1 início | ✅ |
| T3 | T1 | P2 após P1 | ✅ |
| T4 | T3 | T3→T4 | ✅ |
| T5 | T2,T3 | P2 (T2 na P1 ✓) | ✅ |
| T6/T7 | T5 | P3 após P2 | ✅ |
| T8 | T5 | P3 | ✅ |
| T9 | T1 | P4 | ✅ |
| T10/T11 | T1 | P4 [P] entre si sem dependência | ✅ |
| T12 | T6,T11 | P4 último | ✅ |
| T13 | T10-12 | P5 | ✅ |
| T14 | T1-13 | P5 último | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix exige | Task diz | Status |
|---|---|---|---|---|
| T1 | shared logic | unit | unit | ✅ |
| T2 | schema | none | none (Build) | ✅ |
| T3/T4 | billing unit | unit | unit | ✅ |
| T5 | lifecycle | integration | integration | ✅ |
| T6/T7/T8 | rotas | integration | integration | ✅ |
| T9 | client logic | unit | unit | ✅ |
| T10/T11/T12 | UI | none (sem harness render) | none + typecheck | ✅ |
| T13/T14 | i18n/config | none | none | ✅ |

## Status das tasks

- [x] T1 (3945a01) · [x] T2 (914d88b) · [x] T3 (71ea1af) · [x] T4 (a850594) · [x] T5 (843f772) · [x] T6 (2a473ab) · [x] T7 (b6c3a27) · [x] T8 (7b2bb36) · [x] T9 (7cd288f) · [x] T10 (050f039) · [x] T11 (163a89f) · [x] T12 (1974a23) · [x] T13 (766df85) · [x] T14 (T14 commit deste worker)

> F4: chaves billing./errors. novas em pt com texto real; en/es/it/de/fr com placeholder inglês (T13 traduz). PlanSection extraída em plan-section/plan-checkout-form/plan-status-card (<200 linhas cada).

> F2 validada por Verifier dedicado: PASS, sensor 4/4 mutantes mortos (conversão cents, grace boundary, idempotência, webhook auth) — validation.md.
> Desvio F3 (T7, correto): token do webhook re-checado no handler (verifyAndParseWebhook confunde token-ruim com evento-não-mapeado) pra distinguir 401 de 200.

> Desvio F1: `PRO_PRICE_CENTS` removido (substituído por PLAN_PRICES; zero usos confirmados).
> F2: gate re-verificado pelo orquestrador (worker reportou fora do formato): typecheck ok, 108 testes api verdes.
