# Pro Plan + Multi-Gateway Billing — Specification

## Problem Statement

The app has a `free|pro` plan in the schema but nothing actually charges or gates (maxItems suspended, CTA disabled). We need: real Free/Pro gates, charging via Asaas (BR: Pix/card/Pix Automático), and a strategy/DI architecture (`PaymentProvider`) to plug in Stripe (international) without a rewrite — the same pattern as email (port + adapters + env-gate).

## Goals

- [ ] Free household has real limits; Pro removes them — gates shared client+server via `@grosify/shared`
- [ ] Owner/admin subscribes to Pro (monthly/yearly, BRL via Asaas) and status flows via webhook
- [ ] Swapping/adding a gateway = new adapter + case in the factory; zero change to callers

## Out of Scope

| Feature | Reason |
|---|---|
| Stripe live | No international paying customer yet; ships as a 501 stub (port ready) |
| Lifetime/one-time purchase | User chose monthly+yearly only |
| IAP (App Store/Play) | Native app is phase 7; the subscription lives on the web |
| Partial discount coupon | Provider's coupon engine; deferred until a campaign exists |
| NFC-e scan (future Pro feature) | Separate feature; does not block billing |
| Retail media/cashback/B2B data | Phase 2+ monetization |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Checkout UX | Redirect to the provider's hosted checkout (Asaas link) | Less PCI/UI; market standard | assumed |
| Grace on charge failure | Provider retries; Pro is kept while status ≠ `overdue/canceled`; `overdue` > 7d → downgrade | Simple, status-driven | assumed |
| Comp/100% off | `planOverride` column on the household (entitlement in our own database), without going through the gateway | 100% = no charge; provider-agnostic | assumed (previous conversation) |
| Who can subscribe/cancel | `owner` and `admin` of the household | Roles already exist | assumed |
| Prices per currency | Config in shared (`PLAN_PRICES`): BRL 1290/9900; USD 399/2900 (Stripe future) | Local psychological price, not exchange rate | y (conversation) |
| One subscription per household | Unique constraint on active `subscriptions(household_id)` | The subscription belongs to the household (STATE.md) | y |

**Open questions:** none — resolved or logged above.

## User Stories

### P1: Real Free/Pro gates ⭐ MVP
As a Free household owner, I see clear limits (2 members, 30 items, 2 lists, 90d history) and what Pro unlocks (unlimited + photos + price alerts + analytics + export), so I have a reason to subscribe.

**Acceptance Criteria:**
1. WHEN a Free household has 30 items and creates the 31st THEN the API SHALL respond 403 `item_limit` (client shows the paywall)
2. WHEN a Free household has 2 lists and creates the 3rd THEN the API SHALL respond 403 `list_limit`
3. WHEN a Free household has 2 members and accepts the 3rd's invite THEN the API SHALL respond 403 `member_limit`
4. WHEN a Free household accesses an item photo, price alert, analytics, or export THEN the system SHALL block with a Pro CTA (photos: `/uploads` route 403 `pro_required`; client hides/paywalls)
5. WHEN a household is Pro THEN none of the above limits SHALL apply
6. WHEN the plan expires (downgrade) THEN data above the cap SHALL become invisible (read filter, nothing deleted) and return on re-upgrade — same pattern as `historyCutoff`
7. WHEN a Free household has invisible data (items/lists/history above the cap) THEN the client SHALL show a persistent warning with the hidden count ("N items hidden") and an upgrade CTA explaining that Pro reveals them

**Independent Test:** seed a free household with 30 items → POST item = 403; flip to pro → 201.

### P1: Subscribe to Pro via Asaas (BRL) ⭐ MVP
As an owner/admin, I subscribe to Pro (monthly R$12,90 / yearly R$99) paying by Pix or card; the household becomes Pro when the payment confirms.

**Acceptance Criteria:**
1. WHEN an owner/admin POSTs `/billing/checkout` {cycle} THEN the API SHALL create a subscription in Asaas and respond with a hosted checkout URL
2. WHEN a member/viewer tries THEN the API SHALL respond 403
3. WHEN there is no `ASAAS_API_KEY` env THEN the route SHALL respond 501 (the project's env-gate pattern)
4. WHEN an Asaas webhook confirms payment THEN `subscriptions.status` SHALL become `active` and `households.plan` SHALL become `pro`
5. WHEN a webhook arrives with an unknown subscription or invalid token THEN the API SHALL respond 401/404 with no effect
6. WHEN the same webhook event arrives twice THEN the second SHALL be a no-op (idempotent by event id)
7. WHEN a household already has an active subscription and tries to check out THEN the API SHALL respond 409 `already_subscribed`

**Independent Test:** checkout with the Asaas sandbox → simulate a `PAYMENT_CONFIRMED` webhook → GET membership returns plan=pro.

### P1: Subscription lifecycle ⭐ MVP
As a subscriber, I see status/next charge in Settings and I can cancel; delinquency has a 7-day grace period.

**Acceptance Criteria:**
1. WHEN GET `/billing/subscription` THEN the API SHALL return {status, cycle, currency, nextDueDate, provider} or null
2. WHEN an owner/admin cancels THEN the provider SHALL be canceled, status `canceled`, and the plan SHALL revert to `free` at the end of the paid period (not immediately)
3. WHEN a webhook reports a delay THEN status SHALL become `overdue` while keeping `pro`; after 7d in `overdue` THEN the plan SHALL become `free`
4. WHEN the plan becomes `free` THEN AC-6 of story 1 (read filter) SHALL hold

**Independent Test:** simulate OVERDUE/CANCELED webhooks and check the transitions + plan.

### P2: Multi-gateway port (strategy/DI)
As a dev, I swap/add a gateway by creating an adapter — callers don't change.

**Acceptance Criteria:**
1. A `PaymentProvider` port (create/cancel/parse webhook) with a factory by env+currency: BRL→asaas, otherwise→stripe — the single place that knows the concrete providers (mirrors `email/index.ts`)
2. WHEN currency ≠ BRL and Stripe has no credential THEN checkout SHALL respond 501 `provider_unavailable` (stub)
3. Webhooks normalize to a single internal event ({type, externalId, ...}) before touching `subscriptions`
4. `subscriptions` stores `provider` + external IDs; an active subscription never re-routes if the household's currency changes

**Independent Test:** unit test of the factory (env combos) + a fake adapter in the integration tests.

### P2: Plan UI in Settings
Replaces the disabled CTA: Free sees benefits+prices and a subscribe button (monthly/yearly); a subscriber sees status/next due date/cancel; strings in all 6 languages.

**Acceptance Criteria:**
1. WHEN a Free user opens Settings THEN they SHALL see the comparison and monthly/yearly buttons → redirect to checkout
2. WHEN a Pro user opens it THEN they SHALL see status, cycle, next charge, and cancel (with confirm)
3. WHEN returning from checkout THEN the app SHALL refetch membership and reflect the plan (short polling or focus refetch)

### P3: Comp/100% (manual entitlement)
`households.planOverride` ('pro'|null) settable via SQL/future admin; entitlement = `planOverride ?? planFromSubscription`.

**Acceptance Criteria:**
1. WHEN planOverride='pro' THEN the household SHALL be Pro without a subscription, ignoring the gateway

## Edge Cases

- WHEN checkout is created but the webhook never arrives THEN the subscription stays `pending`; a new checkout after 24h SHALL cancel the pending one and create another
- WHEN webhooks arrive out of order (CONFIRMED after CANCELED) THEN the invalid transition SHALL be ignored (the state machine guards it)
- WHEN Asaas is unavailable at checkout THEN the API SHALL respond 502 `provider_error` (no infinite client retry)
- WHEN a household is deleted with an active subscription THEN cancel at the provider best-effort in the LGPD deletion flow
- WHEN downgrading with 80 items THEN the 30 oldest (createdAt asc) SHALL remain visible — deterministic rule

## Requirement Traceability

| ID | Story | Phase | Status |
|---|---|---|---|
| BILL-01 | P1 gates | Design | Pending |
| BILL-02 | P1 checkout Asaas | Design | Pending |
| BILL-03 | P1 lifecycle | Design | Pending |
| BILL-04 | P2 port/strategy | Design | Pending |
| BILL-05 | P2 Settings UI | Design | Pending |
| BILL-06 | P3 override | Design | Pending |

## Success Criteria

- [ ] Asaas sandbox: subscribe → pro; cancel → free at end of period; all via webhook
- [ ] Free hits the 4 caps with a typed error + client paywall
- [ ] Adding a fake gateway in a test = 1 new file + 1 case in the factory

## Implicit-Dimensions Sweep (Large)

| Dimension | Resolution |
|---|---|
| Input validation | zod on the payloads (cycle enum, webhook shape); currency via membership, never body |
| Failure/partial | pending with no webhook (edge case); 502 provider_error; env absent 501 |
| Idempotency/dedup | webhook idempotent by event id (`webhook_events` table or unique) |
| Auth/rate limit | owner/admin only; webhook by token (Asaas) / signature (Stripe); routes' default rate limit |
| Concurrency | partial unique: 1 non-terminal subscription per household |
| Data lifecycle | subscriptions never deleted (audit); terminal status |
| Observability | log of every webhook (type, externalId, result) |
| External failure | env-gate 501; provider down 502; webhook retry is the provider's |
| State transitions | pending→active→overdue→(active|canceled); canceled/expired terminal; guards against invalid order |
