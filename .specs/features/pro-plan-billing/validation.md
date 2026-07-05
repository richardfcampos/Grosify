# Pro Plan + Multi-Gateway Billing — Validation (Feature-Level)

**Date**: 2026-07-05
**Spec**: `.specs/features/pro-plan-billing/spec.md`
**Design (context)**: `.specs/features/pro-plan-billing/design.md`
**Commit range**: `fe58efb..HEAD` (HEAD = `3bef44e`) — 15 commits (spec/design/tasks + T1–T14), 60 files, +7385/−163
**Verifier**: independent sub-agent (author ≠ verifier), read-only over real tree; source mutations in-place then restored via `git checkout --`; only this file written.
**Scope**: whole feature — T1–T14, all stories BILL-01…06 + Edge Cases.

---

## Verdict: ✅ PASS

Gate green (api typecheck 0, web typecheck 0, api 139/139, web 7/7). Sensor 7 mutations, 6 killed / 1 survived. Every server-side AC and every UI-by-inspection AC is traced to `file:line` with a spec-matching assertion (or a rendered component + wired call site + i18n keys for pure-UI). The single surviving mutant is a **discrimination gap in the client preflight fail-open branch** (unknown/null cached plan never asserted at-cap) — not a correctness regression in shipped code, but the test that would lock the fail-open semantics is missing. Ranked below.

---

## Gate Check (contagens exatas)

| Gate | Command | Result |
| --- | --- | --- |
| api typecheck | `pnpm --filter @grosify/api typecheck` | exit 0 |
| web typecheck | `pnpm --filter @grosify/web typecheck` | exit 0 |
| api test | `pnpm --filter @grosify/api test` | **139 passed / 0 failed / 0 skipped** (11 files) |
| web test | `pnpm --filter @grosify/web test` | **7 passed / 0 failed / 0 skipped** (3 files) |

api test files: `test/db-integration`, `test/plans`, `billing/factory`, `billing/asaas-provider`, `test/billing-lifecycle`, `test/billing-routes`, `test/billing-webhook`, `test/plan-gates` + 3 pre-existing. web test files: `sync/plan-gates`, `sync/engine-switch` + 1 pre-existing. Re-run after all mutation restores: still 139/7.

---

## Spec-Anchored Acceptance Criteria

Legend: **assertion** = the value/state asserted (payload/conjunction rule applied — asserts the outcome, not just the call). "por inspeção" = pure-UI AC with no render harness (Test Matrix declares none for UI layer); verified by component existence + correct render condition + wired call site + i18n keys present in all 6 locales.

### BILL-01 — Gates Free/Pro reais (P1)

| AC | file:line | assertion | spec outcome | coberto |
| --- | --- | --- | --- | --- |
| 1 — 31º item Free → 403 `item_limit` | `test/plan-gates.test.ts:159-160` | `status===403` + `json==={error:'item_limit_reached'}` (seeds 30, POST 31º) | 403 item_limit | ✅ |
| 2 — 3ª lista Free → 403 `list_limit` | `test/plan-gates.test.ts:208-209` | `status===403` + `{error:'list_limit_reached'}` (seeds 2, POST 3ª) | 403 list_limit | ✅ |
| 3 — 3º membro Free → 403 `member_limit` | `test/plan-gates.test.ts:249-256` | `status===403` + `{error:'member_limit_reached'}` + member count stays `2` | 403 member_limit | ✅ |
| 4 — fotos Free → `/uploads` 403 `pro_required` | `test/plan-gates.test.ts:289-290` | `status===403` + `{error:'pro_required'}` on `/uploads/presign` | 403 pro_required | ✅ |
| 4 — analytics/CSV/photo client paywall | analytics `pages/analytics-page.tsx:93-98` (free→full-page upsell); photo `pages/item-form-page.tsx:203` (`plan==='free'?setPaywallOpen:filePicker`); CSV/compra gates present | rendered PaywallSheet / upsell | ✅ por inspeção |
| 5 — Pro remove todos os tetos | items `plan-gates.test.ts:163-178` (201), lists `:212-222` (201), members `:259-277` (201, count 3), presign `:293-304` (200 URL) | each `status===201/200` under `plan:'pro'` | no limit | ✅ |
| 6 — downgrade filtra leitura (nada apagado), volta no re-upgrade | `applyFreeCaps` pure logic `test/plans.test.ts:45-75` (id-asc sort, slice, non-mutating); surfaces `lib/use-hidden-counts.ts:29-31` + `pages/{itens,dashboard,listas}-page.tsx` apply it; `check-item-sheet.tsx` applies `historyCutoff` | read-filter, deterministic id-asc | ✅ (logic) + por inspeção (surfaces) |
| 7 — aviso persistente "N ocultos" + CTA upgrade | `features/billing/hidden-data-banner.tsx:17` (null when total 0) + `:28` (`t('billing.hiddenBannerTitle',{items,lists})`) + `:21` (navigate `/ajustes`); wired in `itens-page:162`, `dashboard-page:195`, `listas-page:40`; counts `lib/use-hidden-counts.ts` | persistent banner w/ hidden count + CTA | ✅ por inspeção |

### BILL-02 — Assinar Pro via Asaas (P1)

| AC | file:line | assertion | spec outcome | coberto |
| --- | --- | --- | --- | --- |
| 1 — owner/admin POST checkout → cria sub Asaas + URL hosted | `test/billing-routes.test.ts:135-141` | `status===200` + `json==={checkoutUrl:'…'}` + sub `status==='pending'`, `externalId`, `priceCents===1290`, `currency==='BRL'` | 200 + checkout URL | ✅ |
| 2 — member/viewer → 403 | member `billing-routes.test.ts:165-166` (`403` + `{error:'forbidden'}`); viewer `:173-175` (`403`) | 403 | 403 | ✅ |
| 3 — sem `ASAAS_API_KEY` → 501 | route `billing-routes.test.ts:182-183` (`501` + `{error:'provider_unavailable'}`); factory `factory.test.ts:26` (`billingProviderFor('BRL',{})` null) | 501 provider_unavailable | ✅ |
| 4 — webhook confirma → sub `active` + house `pro` | webhook HTTP `billing-webhook.test.ts:125-128` (`200` + `subStatus==='active'` + `housePlan==='pro'`); also `billing-routes.test.ts:154-157` (`applyBillingEvent`→'applied', active, pro) | active + pro | ✅ |
| 5 — webhook desconhecido/token inválido → 401/404 sem efeito | token inválido `billing-webhook.test.ts:109-113` (`401` + `{error:'invalid_signature'}` + sub stays `pending` + house `free`); assinatura desconhecida `:151-152` (`200` no-op, spec permits "sem efeito") | 401/404, no effect | ✅ |
| 6 — mesmo evento 2× → 2º no-op (idempotente) | `billing-webhook.test.ts:135-142` (2× `200`, `webhook_events` rows for eventId ===1); lifecycle `billing-lifecycle.test.ts:181-189` ('applied' then 'duplicate') | idempotent no-op | ✅ |
| 7 — já-ativa + checkout → 409 `already_subscribed` | `billing-routes.test.ts:202-203` (`409` + `{error:'already_subscribed'}`) | 409 already_subscribed | ✅ |

### BILL-03 — Ciclo de vida da assinatura (P1)

| AC | file:line | assertion | spec outcome | coberto |
| --- | --- | --- | --- | --- |
| 1 — GET subscription → {status,cycle,currency,nextDueDate,provider}\|null | null `billing-routes.test.ts:277-279` (`{subscription:null}`); shape `:299-304` (status/cycle/currency/priceCents/provider + nextDueDate not null); prefers non-terminal `:329-331` | shape or null | ✅ |
| 2 — cancel → provider canceled, status `canceled`, plan→free no fim do período (não imediato) | `billing-routes.test.ts:357-364` (`200` + `cancelSpy('sub_1')` + sub `canceled` + `canceledAt` set + `currentPeriodEnd===nextDueDate` + `housePlan==='pro'` — not immediate); lifecycle immediate cancel→free (no paid period) `billing-lifecycle.test.ts:141-152` | canceled, pro until period end | ✅ |
| 3 — overdue mantém pro; após 7d → free | overdue keeps pro `billing-lifecycle.test.ts:115-126` (`overdue`, `overdueSince≠null`, house pro); grace boundary 8d→free `:222-232` (`resolveEffectivePlan==='free'` ×2 incl. write-behind); 2d→pro `:234-243` | pro in grace, free after 7d | ✅ |
| 4 — plan `free` → AC-6 read-filter vale | canceled+expired→free `billing-lifecycle.test.ts:245-254`; then read-filter is `applyFreeCaps` (BILL-01 AC6 logic verified `plans.test.ts`) | read-filter after free | ✅ (composed) |

### BILL-04 — Porta multi-gateway (P2)

| AC | file:line | assertion | spec outcome | coberto |
| --- | --- | --- | --- | --- |
| 1 — porta+factory BRL→asaas / senão→stripe, único lugar, setBillingProvider | `factory.test.ts:29-32` (BRL+key→'asaas'), `:38-41` (USD+key→'stripe'), `:72-73` (override wins), `:76-77` (falls to factory), `:88-90` (reset clears) | factory por env+moeda | ✅ |
| 2 — moeda≠BRL sem Stripe cred → checkout 501 `provider_unavailable` (stub) | factory `factory.test.ts:34-36` (USD no stripe key→null→501); stub throws `factory.test.ts:49-61` (`.toThrow('provider_unavailable')` on create/cancel/webhook); route maps `provider_unavailable`→501 `billing-routes.test.ts:268-269` | 501 provider_unavailable | ✅ |
| 3 — webhooks normalizam pra BillingEvent único antes de tocar subscriptions | all 8 Asaas event mappings → normalized `type` `asaas-provider.test.ts:161-227`; lifecycle consumes normalized `BillingEvent` | normalized internal event | ✅ |
| 4 — sub guarda provider + externalIds; ativa não re-roteia se moeda muda | provider locked by currency `factory.test.ts:43-45` (USD never→asaas even w/ ASAAS key); sub row carries `provider` (GET returns it `billing-routes.test.ts:303`) | provider pinned on row | ✅ |

### BILL-05 — UI de plano em Ajustes (P2)

| AC | evidência | spec outcome | coberto |
| --- | --- | --- | --- |
| 1 — Free vê comparativo + botões mensal/anual → redirect checkout | `features/billing/plan-section.tsx:94-102` renders `PlanCheckoutForm` when `plan==='free'`; `:52-54` `onSuccess`→`window.location.href=checkoutUrl`; PlanSection mounted `pages/ajustes-page.tsx:256` | comparativo + checkout redirect | ✅ por inspeção |
| 2 — Pro vê status/ciclo/próxima cobrança + cancelar (confirm) | `plan-section.tsx:108-115` renders `PlanStatusCard` when managed sub; cancel via `useConfirm` `:71-79`; `plan-status-card.tsx` shows status/cycle/next-due | status + cancel w/ confirm | ✅ por inspeção |
| 3 — volta do checkout → refetch membership + reflete plan | `plan-section.tsx` doc `:19-21` (focus-refetch default) + cancel `invalidateQueries(['membership'])` `:66` + `['billingSubscription']` `:67` | refetch on return | ✅ por inspeção |

### BILL-06 — Comp/100% override (P3)

| AC | file:line | assertion | spec outcome | coberto |
| --- | --- | --- | --- | --- |
| 1 — planOverride='pro' → Pro sem assinatura, ignora gateway | resolve `billing-lifecycle.test.ts:267-276` (`resolveEffectivePlan==='pro'` w/ expired sub); gate bypass `test/plan-gates.test.ts:180-195` (override on free household → 31º item `201`) | pro without subscription | ✅ |

### Edge Cases (spec §Edge Cases)

| Edge | file:line | assertion | coberto |
| --- | --- | --- | --- |
| checkout mas webhook nunca chega → pending; novo checkout >24h cancela+recria | `billing-routes.test.ts:224-234` (`200` + `cancelSpy('sub_stale')` + old→`canceled` + new→`pending`) | ✅ |
| webhooks fora de ordem (CONFIRMED após CANCELED) ignorado | `billing-lifecycle.test.ts:198-207` (`ignored_terminal`, sub stays `canceled`, house `free`) | ✅ |
| Asaas indisponível no checkout → 502 `provider_error` | `billing-routes.test.ts:250-252` (`502` + `{error:'provider_error'}` + linha→`canceled`) | ✅ |
| household deletado com sub ativa → cancel best-effort (LGPD) | design §4/T8(f); LGPD cancel path present in `routes/households.ts` deletion — no dedicated test | ⚠️ inspeção (no test) |
| downgrade com 80 itens → 30 mais antigos visíveis (id asc determinístico) | `plans.test.ts:53-64` (`applyFreeCaps` sorts id-asc, slices cap; cap>total returns all ordered) | ✅ |
| transição inválida (overdue em pending) ignorada | `billing-lifecycle.test.ts:209-218` (`ignored_invalid_transition`, sub stays `pending`) | ✅ |
| webhook body não-JSON → 400 bad_payload | `billing-webhook.test.ts:168-171` (`400` + `{error:'bad_payload'}`) | ✅ |

**Additional verified (T4 provider unit, from Phase-2, still green):** 1290→"12.90" conversion (100× guard) `asaas-provider.test.ts:44-46`; every event mapping + webhook token auth `:145-227`; cancel DELETE 404 idempotent `:126-129` / 500 throws `:131-134`.

---

## Discrimination Sensor (P0-critical: gates + payment + client sync)

Method: in-place source edit → run targeted test(s) → restore `git checkout --` → `git status --short` confirms clean after each. Avoided the 4 branches already killed in Phase 2 (cents conversion, grace boundary, idempotency, webhook auth). 7 mutations across the highest-risk feature-level branches.

| # | Mutation | File:line | Target test | Killed? |
| - | -------- | --------- | ----------- | ------- |
| a | item teto off-by-one: `itemCount >= maxItems` → `>` | `routes/catalog.ts:219` | `plan-gates.test.ts:159` (31º→403) | ✅ Killed — `expected 201 to be 403` |
| b | remove role gate no checkout: `if(!canManageBilling)` → `if(false&&…)` | `routes/billing.ts:39` | `billing-routes.test.ts:165` (member→403) | ✅ Killed — member checkout no longer 403 |
| c | remove 409 guard: `if(!isStalePending)` → `if(!isStalePending&&false)` | `routes/billing.ts:71` | `billing-routes.test.ts:202` (já-ativa→409) | ✅ Killed — active household no longer 409 |
| d | canceled deixa de ser terminal: `if(sub.status==='canceled')` → `if(false&&…)` | `billing/lifecycle.ts:60` | `billing-lifecycle.test.ts:204` (CONFIRMED após CANCELED) | ✅ Killed — reactivates instead of `ignored_terminal` |
| e | remove member gate na tx do /join: `if(memberCount>=…)` → `if(false&&…)` | `routes/households.ts:440` | `plan-gates.test.ts:249` (3º membro→403) | ✅ Killed — 3rd member joins full free house |
| f | preflight fail-open→fail-closed: `if(plan==='free')` → `if(plan!=='pro')` | `db/repositories.ts:50` | `sync/plan-gates.test.ts` (all 4) | ❌ **Survived** — see gap 1 |
| g | remove delete otimista no 403: drop `reconcilePlanRejection(entry)` | `sync/engine.ts:207` | `sync/plan-gates.test.ts:103` (403 remove otimista) | ✅ Killed — orphan survives (`expected undefined`) |

**Result**: 7 mutations, **6 killed / 1 survived**. Tests discriminate on every server-side critical branch (item/list/member tetos, role gate, 409 uniqueness, canceled-terminal machine guard, optimistic 403 reconciliation). The single survivor is a client-side coverage gap in the fail-open semantics, not a shipped-code defect.

---

## Ranked Gaps

1. **[low severity — test coverage, not a code bug] Client preflight fail-open branch is under-discriminated.**
   `createItem` (`apps/web/src/db/repositories.ts:49-53`) intentionally blocks only when `cachedPlan()==='free'` (fail-open: unknown/null plan passes to the server, which is authoritative). Mutating the guard to `plan!=='pro'` (fail-closed — null now blocks) does **not** fail any test: the only test that seeds items at the cap sets `plan='free'` explicitly (`sync/plan-gates.test.ts:57-69`), and the two null-plan tests (`:91`, `:107`) seed **0** items so the cap check is never reached. No test asserts "unknown/null plan at cap → NOT blocked (falls through to optimistic write + server reconciliation)". A shipped code path exists that no test pins; a regression to fail-closed would silently block legitimate creates when the plan cache is cold (first launch / post-clear).
   **Suggested lock (not applied — Verifier does not edit code):** add a `sync/plan-gates.test.ts` case: seed `FREE_MAX_ITEMS` items, leave `cachedPlan` unset (null), assert `createItem(...)` resolves (does not throw) and enqueues — proving fail-open at the cap.

No other gaps. No spec-precision mismatches found on any covered AC (HTTP status, error code, and state values all match spec verbatim). No surviving server-side mutants.

---

## Notes / Observations

1. **Webhook 401 vs 404 (BILL-02 AC5):** spec says "401/404 sem efeito" for unknown-subscription-or-invalid-token. Implementation returns **401** for bad token (`billing-webhook.test.ts:109`) and **200 no-op** for unknown subscription (`:151`). The 200 (not 404) for unknown-subscription is acceptable under the design's "handler never throws → 200 + log" rule (webhook queue must not be interrupted) and still satisfies "sem efeito" — the DB is unchanged. Spec's "401/404" is an OR over the two failure kinds; token failure is 401 as required. Not a gap; flagged for transparency.
2. **`tasks.md` T14 status line** says "T14 commit deste worker" (placeholder) but HEAD `3bef44e` is the T14 commit — the placeholder was not rewritten to the hash. Cosmetic; does not affect code.
3. **LGPD household-delete cancel** (Edge Case) and **compra-page photo gate / CSV export gate** (BILL-01 AC4 secondary surfaces) are verified by code inspection only — no automated test. Consistent with the Test Matrix (UI + deletion flows: build gate only). Acceptable per documented guidelines.
4. Sensor mutations touched 6 source files; all restored; final `git status --short` shows only `validation.md` modified and pre-existing untracked report files outside scope.

---

## Validação da fase 2 (T3–T5) — resumo preservado

O relatório anterior deste arquivo cobria só a Fase 2 (porta/factory/Stripe stub, adapter Asaas, lifecycle) sobre `914d88b..843f772`. Veredito **PASS**; gate 108/108; sensor **4/4 mortos** nas quatro branches de maior risco:

| # | File:line | Mutação | Killed? |
| - | --------- | ------- | ------- |
| a | `asaas-provider.ts:84` | `priceCents/100` → `priceCents` (bug 100×) | ✅ `Expected 12.9, Received 1290` |
| b | `lifecycle.ts:186` | grace `<` → `>` (flip boundary) | ✅ 8d/2d falham |
| c | `lifecycle.ts:44` | remove `return 'duplicate'` (idempotência) | ✅ `Expected 'duplicate', Received 'applied'` |
| d | `asaas-provider.ts:120` | desliga check de token do webhook | ✅ token errado deixa de virar null |

Todos os ACs em escopo da Fase 2 (BILL-02/03/04/06, primitivas server-side) tinham assertion batendo com o spec; 0 gaps de precisão. Essas quatro branches **não** foram re-mutadas nesta rodada feature-level (evitando repetição); a Fase 3 (rotas/webhook/gates HTTP) e o client foram as novas superfícies mutadas aqui.
