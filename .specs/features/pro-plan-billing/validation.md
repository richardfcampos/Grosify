# Pro Plan + Multi-Gateway Billing — Validation (Phase 2: T3, T4, T5)

**Date**: 2026-07-05
**Spec**: `.specs/features/pro-plan-billing/spec.md`
**Diff range**: `914d88b..843f772` (8 files, +1101)
**Verifier**: independent sub-agent (author ≠ verifier), read-only over real tree; mutations in scratch state only, restored.
**Scope**: T3 (porta/factory/Stripe stub) · T4 (adapter Asaas) · T5 (lifecycle máquina de estados + idempotência + lazy expiry). Server-side only. Rotas/webhook/gates HTTP são P3 (T6-T8), fora deste escopo.

---

## Verdict: ✅ PASS

Gate green (typecheck 0, 108/108 tests). Sensor 4/4 mutations killed. All in-scope ACs traced to `file:line` with spec-matching assertions. No surviving mutants, no spec-precision gaps in scope.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T3 Porta PaymentProvider + factory + Stripe stub | ✅ Done | commit `71ea1af` |
| T4 Adapter Asaas | ✅ Done | commit `a850594` |
| T5 Lifecycle | ✅ Done | commit `843f772` (= HEAD) |

---

## Spec-Anchored Acceptance Criteria

### BILL-04 (P2 porta/strategy) — T3

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 factory por env+moeda: BRL→asaas | provider name `asaas` quando `ASAAS_API_KEY` | `factory.test.ts:29-32` — `expect(p?.name).toBe('asaas')` | ✅ PASS |
| AC1 senão→stripe | provider name `stripe` quando `STRIPE_SECRET_KEY` | `factory.test.ts:38-41` — `expect(p?.name).toBe('stripe')` | ✅ PASS |
| AC1 único lugar / setBillingProvider p/ testes | override vence factory; reset limpa | `factory.test.ts:65-90` — `expect(getBillingProvider('BRL',{})).toBe(fake)` / `.toBeNull()` após reset | ✅ PASS |
| AC2 Stripe sem credencial → stub (rota 501) | `billingProviderFor('USD',{...})` → null (rota mapeia 501) | `factory.test.ts:34-36` — `expect(billingProviderFor('USD',{ASAAS_API_KEY:'k'})).toBeNull()` | ✅ PASS |
| AC2 Stripe stub lança provider_unavailable | todo método lança `provider_unavailable` | `factory.test.ts:48-62` — `.toThrow('provider_unavailable')` (create/cancel/webhook) | ✅ PASS |
| AC4 provider travado por moeda (moeda≠BRL nunca re-roteia p/ Asaas) | null mesmo com `ASAAS_API_KEY` em USD | `factory.test.ts:43-45` — `expect(billingProviderFor('USD',{ASAAS_API_KEY:'k'})).toBeNull()` | ✅ PASS |
| Edge: BRL sem env → null | null (rota → 501) | `factory.test.ts:25-27` — `expect(billingProviderFor('BRL',{})).toBeNull()` | ✅ PASS |

### BILL-02 (P1 checkout Asaas) — T4

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| **1290→12.90 conversão (risco 100x)** | value = `12.9` / `"12.90"`, **nunca** 1290 | `asaas-provider.test.ts:44-46` — `expect(sentBody.value).toBe(12.9)` + `.toFixed(2)).toBe('12.90')` + `.not.toBe(1290)` | ✅ PASS |
| createSubscription billingType UNDEFINED + externalReference | `billingType='UNDEFINED'`, `cycle='MONTHLY'`, `externalReference='hh-1'`, `customer='cus_1'` | `asaas-provider.test.ts:58-61` — 4x `toBe` | ✅ PASS |
| cycle yearly → YEARLY | `cycle='YEARLY'` | `asaas-provider.test.ts:64-73` — `expect(sentBody.cycle).toBe('YEARLY')` | ✅ PASS |
| headers access_token + User-Agent (obrigatório) | toda chamada leva os 3 headers | `asaas-provider.test.ts:81-88` — `toMatchObject({access_token,'Content-Type','User-Agent':'Grosify'})` | ✅ PASS |
| checkoutUrl = invoiceUrl da 1ª cobrança | `{externalId:'sub_1',externalCustomerId:'cus_1',checkoutUrl:'https://asaas/pay/1'}` + GET `/payments` | `asaas-provider.test.ts:97-103` — `toEqual({...})` + URL da 3ª chamada | ✅ PASS |
| ASAAS_BASE_URL custom | usa base custom | `asaas-provider.test.ts:106-113` — `.toBe('https://api.asaas.com/v3/customers')` | ✅ PASS |
| cancel DELETE 2xx | resolve; método DELETE na URL certa | `asaas-provider.test.ts:117-124` | ✅ PASS |
| cancel DELETE 404 idempotente | resolve (não lança) | `asaas-provider.test.ts:126-129` — `.resolves.toBeUndefined()` | ✅ PASS |
| cancel DELETE 500 lança | `asaas_500` | `asaas-provider.test.ts:131-134` — `.rejects.toThrow(/asaas_500/)` | ✅ PASS |
| **AC5 webhook token inválido → null sem efeito** | evento null | `asaas-provider.test.ts:145-151` — `expect(evt).toBeNull()` (token `errado`) | ✅ PASS |
| mapping PAYMENT_CONFIRMED→payment_confirmed | type+eventId+externalSubscriptionId | `asaas-provider.test.ts:161-171` — `toMatchObject({eventId:'evt_9',type:'payment_confirmed',externalSubscriptionId:'sub_9'})` | ✅ PASS |
| mapping PAYMENT_RECEIVED→payment_confirmed | `payment_confirmed` | `asaas-provider.test.ts:173-179` | ✅ PASS |
| mapping PAYMENT_OVERDUE→payment_overdue | `payment_overdue` | `asaas-provider.test.ts:181-187` | ✅ PASS |
| mapping PAYMENT_REFUNDED→payment_refunded | `payment_refunded` | `asaas-provider.test.ts:189-195` | ✅ PASS |
| mapping PAYMENT_CHARGEBACK_*→chargeback | `chargeback` | `asaas-provider.test.ts:197-203` (PAYMENT_CHARGEBACK_REQUESTED) | ✅ PASS |
| mapping SUBSCRIPTION_DELETED→subscription_deleted (externalId de subscription.id) | `subscription_deleted`, externalId `sub_7` | `asaas-provider.test.ts:205-211` — `toMatchObject({type:'subscription_deleted',externalSubscriptionId:'sub_7'})` | ✅ PASS |
| mapping SUBSCRIPTION_INACTIVATED→subscription_deleted | `subscription_deleted` | `asaas-provider.test.ts:213-219` | ✅ PASS |
| evento desconhecido → null (200) | null com token válido | `asaas-provider.test.ts:221-227` — PAYMENT_CREATED → `.toBeNull()` | ✅ PASS |

### BILL-03 (P1 ciclo de vida) + BILL-06 (P3 override) — T5

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| BILL-02 AC4 webhook confirma → status active + plan pro | sub `active`, house `pro` | `billing-lifecycle.test.ts:104-113` — `res 'applied'` + `status 'active'` + `housePlan 'pro'` | ✅ PASS |
| BILL-03 AC3 atraso → overdue mantendo pro + overdueSince | `overdue`, `overdueSince≠null`, house `pro` (grace) | `billing-lifecycle.test.ts:115-126` | ✅ PASS |
| overdue→active limpa overdueSince | `active`, `overdueSince=null`, `pro` | `billing-lifecycle.test.ts:128-139` | ✅ PASS |
| BILL-03 AC2 cancel → canceled + free (sem período pago) | `canceled`, `canceledAt≠null`, house `free` | `billing-lifecycle.test.ts:141-152` | ✅ PASS |
| BILL-03 AC2 pro até fim do período pago (não imediato) | house permanece `pro` com currentPeriodEnd futuro | `billing-lifecycle.test.ts:154-165` — `expect(await housePlan(h)).toBe('pro')` | ✅ PASS |
| refund → canceled | `canceled` | `billing-lifecycle.test.ts:167-172` | ✅ PASS |
| chargeback → canceled | `canceled` | `billing-lifecycle.test.ts:174-179` | ✅ PASS |
| **BILL-02 AC6 idempotência (evento duplicado no-op)** | 1º `applied`, 2º `duplicate`, sub fica `active` | `billing-lifecycle.test.ts:181-189` — `.toBe('applied')` / `.toBe('duplicate')` | ✅ PASS |
| BILL-02 AC5 assinatura desconhecida → sem efeito | `unknown_subscription`, house `free` | `billing-lifecycle.test.ts:191-196` | ✅ PASS |
| **Edge out-of-order/terminal (CONFIRMED após CANCELED ignorado)** | `ignored_terminal`, sub `canceled`, house `free` | `billing-lifecycle.test.ts:198-207` | ✅ PASS |
| Edge transição inválida (overdue em pending) ignorada | `ignored_invalid_transition`, sub `pending` | `billing-lifecycle.test.ts:209-218` | ✅ PASS |
| **BILL-03 AC3 grace boundary: overdue 8d → free (write-behind)** | `resolveEffectivePlan='free'` + house persistido `free` | `billing-lifecycle.test.ts:222-232` — `.toBe('free')` (2x) | ✅ PASS |
| **BILL-03 grace boundary: overdue 2d → pro (dentro do grace)** | `resolveEffectivePlan='pro'` | `billing-lifecycle.test.ts:234-243` — `.toBe('pro')` | ✅ PASS |
| BILL-03 AC4 canceled + currentPeriodEnd vencido → free | `free` | `billing-lifecycle.test.ts:245-254` | ✅ PASS |
| canceled + currentPeriodEnd futuro → pro | `pro` | `billing-lifecycle.test.ts:256-265` | ✅ PASS |
| **BILL-06 AC1 planOverride='pro' vence assinatura expirada** | `pro` sem assinatura ativa | `billing-lifecycle.test.ts:267-276` — `.toBe('pro')` | ✅ PASS |

**Status**: ✅ All in-scope ACs covered with spec-matching assertions. No spec-precision gaps.

**Out of Phase-2 scope (correctly deferred to T6-T8, P3):** BILL-02 AC1 (POST /billing/checkout URL), AC2 (403 role), AC3 (501 env-gate at route), AC7 (409 already_subscribed); BILL-03 AC1 (GET /billing/subscription shape). These are HTTP-route ACs; the provider/lifecycle primitives they compose over ARE verified here.

---

## Discrimination Sensor (P0-critical: payment path)

Scratch method: in-place edit of source → run targeted test → restore via `git checkout --`. Tree verified clean after each.

| # | File:line | Mutation | Target test | Killed? |
| - | --------- | -------- | ----------- | ------- |
| a | `asaas-provider.ts:84` | `params.priceCents / 100` → `params.priceCents` (100x bug) | `asaas-provider.test.ts:35` conversão cents→reais | ✅ Killed — `Expected 12.9, Received 1290` |
| b | `lifecycle.ts:186` | grace `< now.getTime()` → `> now.getTime()` (flip boundary) | `billing-lifecycle.test.ts` grace 8d→free & 2d→pro | ✅ Killed — 2 failures (`expected 'free' to be 'pro'` on 2d; 8d also flipped) |
| c | `lifecycle.ts:44` | remove `if (inserted.length === 0) return 'duplicate'` (idempotency no-op) | `billing-lifecycle.test.ts:181` evento duplicado | ✅ Killed — `Expected 'duplicate', Received 'applied'` |
| d | `asaas-provider.ts:120` | `if (received !== expected) return null` → `if (false)` (disable token check) | `asaas-provider.test.ts:145` token errado→null | ✅ Killed — `expected {...payment_confirmed} to be null` |

**Sensor depth**: P0-full (4 manual behavior-level mutations across all four highest-risk branches: money conversion, grace boundary, idempotency, webhook auth).
**Result**: 4/4 killed — ✅ PASS. Tests are discriminating on every critical branch.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code (no scope creep) | ✅ Port mirrors `email/index.ts`; adapter is thin fetch, no SDK |
| Surgical changes | ✅ 8 new files only; no unrelated edits |
| Matches existing patterns | ✅ factory + setProvider + reset mirrors email module; webhook thin-handler shape |
| Spec-anchored outcome check | ✅ Asserted values match spec (12.90 not 1290; 7d grace; null on token mismatch) |
| Per-layer Coverage: unit (env combos, cents→reais, every event mapping) | ✅ factory.test + asaas-provider.test |
| Per-layer Coverage: integration (each transition, idempotency, out-of-order, grace, override) | ✅ billing-lifecycle.test (PGlite) |
| Every test maps to a spec AC / edge case | ✅ No unclaimed tests |
| Documented guidelines followed | ✅ tasks.md Test Coverage Matrix (unit fetch-mocked; integration PGlite); strong defaults, no coverage threshold configured |

---

## Edge Cases (in scope)

- [x] Webhook out-of-order (CONFIRMED após CANCELED) → `ignored_terminal`, no state change — `billing-lifecycle.test.ts:198`
- [x] Invalid transition (overdue em pending) → `ignored_invalid_transition` — `billing-lifecycle.test.ts:209`
- [x] Duplicate webhook event → no-op via unique(provider,eventId) — `billing-lifecycle.test.ts:181`
- [x] overdue > 7d grace boundary → lazy free flip (8d) / stays pro (2d) — `billing-lifecycle.test.ts:222,234`
- [x] cancel DELETE 404 idempotent — `asaas-provider.test.ts:126`
- [ ] "checkout mas webhook nunca chega → pending; novo checkout >24h cancela" — route-level (T6), out of Phase-2 scope
- [ ] "Asaas indisponível no checkout → 502" — route-level (T6), out of Phase-2 scope

---

## Gate Check

- **Gate command**: `pnpm --filter @grosify/api typecheck && pnpm --filter @grosify/api test`
- **typecheck**: exit 0
- **test**: exit 0 — **108 passed / 0 failed / 0 skipped** (8 files) — matches expected count
- **In-scope test files**: `billing/factory.test.ts` (13), `billing/asaas-provider.test.ts` (19), `test/billing-lifecycle.test.ts` (16)
- **Failures**: none
- **Skipped**: none

---

## Requirement Traceability Update (Phase-2 primitives)

| Requirement | Previous | New (server primitives) |
| ----------- | -------- | ----------------------- |
| BILL-04 (porta/strategy) | Pending | ✅ Verified (T3) |
| BILL-02 (adapter Asaas: create/cancel/webhook parse+auth+mapping+cents) | Pending | ✅ Verified (T4) — HTTP route ACs remain for T6 |
| BILL-03 (lifecycle: máquina de estados, grace, lazy expiry) | Pending | ✅ Verified (T5) — GET route AC remains for T6 |
| BILL-06 (planOverride precedence) | Pending | ✅ Verified (T5) |

---

## Notes / Observations

1. **`tasks.md` unstaged change (not mine):** during this session an external write (orchestrator status update) marked T1-T5 done with commit hashes and logged deviations (F1: `PRO_PRICE_CENTS` removed, superseded by `PLAN_PRICES`, zero usages; F2: gate re-verified). Verifier is read-only and did NOT touch `tasks.md`; left in place to avoid clobbering legitimate author state. `apps/api/src/billing/*.ts` all restored to committed state; only `validation.md` added by Verifier.
2. **Webhook token dev-bypass:** `asaas-provider.ts:121-123` — when `ASAAS_WEBHOOK_TOKEN` is unset it accepts the webhook (dev convenience, logged warn). Matches design ("token verificado" gated on env presence). Production must set the env; not a test gap.
3. **Route-layer ACs (409/501/502/403 checkout, GET subscription shape, webhook 401 HTTP status) are deliberately Phase-3 (T6-T8)** and not asserted here — the underlying provider/lifecycle behavior they build on is fully covered.

---

## Summary

**Overall**: ✅ Ready (Phase 2 / T3-T5)

**Spec-anchored check**: all in-scope BILL-02/03/04/06 ACs matched spec outcome; 0 spec-precision gaps.
**Sensor**: 4/4 mutations killed (P0-full: cents conversion, grace boundary, idempotency, webhook auth).
**Gate**: 108 passed, 0 failed.

**What works**: money conversion asserts 12.90 not 1290; webhook token mismatch → null; all 8 event-type mappings; idempotency duplicate no-op; out-of-order terminal guard; invalid-transition guard; 7d grace boundary (8d→free, 2d→pro); planOverride precedence; factory env+currency routing; Stripe stub throws provider_unavailable.

**Issues found**: none in scope.

**Next steps**: proceed to Phase 3 (T6-T8: routes, webhook HTTP handler, server gates) — the route-level ACs deferred above get verified there.
