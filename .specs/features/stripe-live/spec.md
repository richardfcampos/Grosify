# Stripe Live Adapter — Specification

## Problem Statement

The `PaymentProvider` port (`.specs/features/pro-plan-billing/`) already ships with Asaas live (BRL) and a **Stripe stub** that throws `provider_unavailable` on every call. Any non-BRL household gets a 501 checkout. We want a **real Stripe adapter** on the same port so an international (USD) household can subscribe — implemented exactly like Asaas (`fetch`, no SDK), fully **env-gated**: without `STRIPE_SECRET_KEY` nothing changes (factory returns `null` → route stays 501, the stub's behaviour).

The lifecycle/state machine (`billing/lifecycle.ts`) does NOT change — the adapter only produces normalized `BillingEvent`s. Callers (`routes/billing.ts`) don't change; they already resolve the provider by currency via the factory.

## Goals

- [ ] Non-BRL household with `STRIPE_SECRET_KEY` set → real Stripe subscription + hosted-invoice checkout URL
- [ ] Stripe webhook verified (HMAC signature), normalized to `BillingEvent`, applied idempotently
- [ ] Without `STRIPE_SECRET_KEY` → factory returns `null` → checkout 501 (zero behaviour change vs. today's stub)
- [ ] The stub (`stripe-provider.ts` throwing `provider_unavailable`) is replaced by the concrete adapter

## Out of Scope

| Feature | Reason |
|---|---|
| Stripe Checkout Sessions / Payment Links | We reuse the port's hosted-URL contract; the subscription's `latest_invoice.hosted_invoice_url` is the checkout URL (parallels Asaas `invoiceUrl`) |
| Stripe SDK (`stripe` npm) | Project pattern is raw `fetch` (mirrors Asaas + Resend) — deps minimal |
| Stripe Prices/Products catalog (pre-created price ids) | We send inline `price_data` per checkout — no dashboard pre-config, price is `PLAN_PRICES.USD` |
| Tax / proration / trials | Not in the billing MVP |
| CPF/CNPJ persistence | `cpfCnpj` from the payload is IGNORED by Stripe (no equivalent field); never persisted (LGPD) |

## Assumptions & Decisions

| Decision | Value | Rationale |
|---|---|---|
| Checkout UX | Redirect to `latest_invoice.hosted_invoice_url` (Stripe hosted invoice page) | No PCI/UI on our side; mirrors Asaas hosted invoice; subscription created `default_incomplete` so the invoice is payable |
| Currency/price | `usd` + `PLAN_PRICES.USD` (399 monthly / 2900 yearly) in **cents** | Stripe `unit_amount` is already minor units — sent **as-is**, NO ÷100 (the Asaas divergence, see AC below) |
| Product name | Inline `price_data.product_data.name = 'Grosify Pro'` | Avoids pre-creating a Product in the dashboard |
| Signature scheme | `Stripe-Signature: t=<ts>,v1=<hmac>`; HMAC-SHA256(`STRIPE_WEBHOOK_SECRET`, `${t}.${body}`); 5-min tolerance; `timingSafeEqual` | Standard Stripe webhook signing (mirrors the `verifySvix` shape in `routes/webhooks.ts`) |
| `cpfCnpj` | Ignored (no Stripe field) | Documented so a future reader doesn't hunt for it |

## User Stories & Acceptance Criteria

### P0: Create subscription (form-encoded) ⭐

As a non-BRL owner/admin, checkout creates a real Stripe subscription and returns a hosted-invoice URL.

**Acceptance Criteria:**
1. WHEN `createSubscription` runs THEN it SHALL `POST /v1/customers` (`name`, `email`, `metadata[householdId]`) then `POST /v1/subscriptions` — both **`application/x-www-form-urlencoded`**, NOT JSON (Stripe's content type)
2. WHEN encoding the subscription THEN `items[0][price_data][unit_amount]` SHALL equal `priceCents` **exactly** (e.g. `399` → `399`), with **NO ÷100** — Stripe uses minor units directly (this is the explicit divergence from Asaas, which sends decimal reais)
3. WHEN encoding THEN it SHALL send `items[0][price_data][currency]=usd`, `[recurring][interval]=month|year` (from `cycle`), `[product_data][name]=Grosify Pro`, `payment_behavior=default_incomplete`, `payment_settings[save_default_payment_method]=on_subscription`, `expand[]=latest_invoice`
4. WHEN both calls succeed THEN it SHALL return `{ externalId: <sub id>, externalCustomerId: <cus id>, checkoutUrl: <latest_invoice.hosted_invoice_url> }`
5. WHEN any call is non-2xx THEN it SHALL throw `stripe_<status>: <detail>` (mirrors Asaas error shape)
6. Every request SHALL carry `Authorization: Bearer <STRIPE_SECRET_KEY>` and `Content-Type: application/x-www-form-urlencoded`
7. `cpfCnpj` from the params SHALL be ignored (no Stripe field)

### P0: Cancel subscription

**Acceptance Criteria:**
1. WHEN `cancelSubscription(id)` runs THEN it SHALL `DELETE /v1/subscriptions/{id}`
2. WHEN the response is 2xx OR 404 THEN it SHALL resolve (idempotent — 404 = already gone)
3. WHEN 5xx THEN it SHALL throw `stripe_<status>`

### P0: Verify & parse webhook

**Acceptance Criteria:**
1. WHEN `STRIPE_WEBHOOK_SECRET` is set AND the `Stripe-Signature` HMAC is invalid THEN it SHALL return `null` (route → 401, no effect)
2. WHEN the signature timestamp is older than 5 min THEN it SHALL return `null` (replay guard)
3. WHEN the signature is valid THEN it SHALL parse and map by event type:
   - `invoice.paid` | `invoice.payment_succeeded` → `payment_confirmed`
   - `invoice.payment_failed` → `payment_overdue`
   - `customer.subscription.deleted` → `subscription_deleted`
   - `charge.refunded` → `payment_refunded`
   - `charge.dispute.created` → `chargeback`
   - anything else → `null` (route → 200, no effect)
4. WHEN mapping THEN `externalSubscriptionId` SHALL be extracted per event object: `invoice.subscription` (invoice events), `object.id` (subscription events), or `object.metadata.subscriptionId` / `charge` correlation for charge events; `eventId = evt.id`
5. WHEN `STRIPE_WEBHOOK_SECRET` is absent THEN it SHALL warn and accept (dev), mirroring the Asaas/Resend dev-gate

### P1: Factory routing

**Acceptance Criteria:**
1. WHEN currency ≠ BRL AND `STRIPE_SECRET_KEY` is set THEN the factory SHALL return `StripeProvider`
2. WHEN `STRIPE_SECRET_KEY` is absent THEN the factory SHALL return `null` (route → 501) — identical to the old stub's externally-observable behaviour
3. The stub throwing `provider_unavailable` is deleted; `StripeProvider` is now the concrete adapter

### P1: Webhook route

**Acceptance Criteria:**
1. `POST /webhooks/stripe` SHALL mirror `/asaas`: invalid signature → 401 no effect; bad payload → 400; unmapped/uncorrelated event → 200 no effect; `applyBillingEvent(evt, 'stripe')` in try/catch → always 200; log `[webhook:stripe]`
2. WHEN a valid `invoice.paid` for a known `stripe` subscription arrives THEN the subscription becomes `active` and the household `pro`
3. WHEN the same event id arrives twice THEN the second SHALL be a no-op (idempotent by `(provider='stripe', eventId)` in `webhook_events`)

## Edge Cases

- WHEN `latest_invoice` has no `hosted_invoice_url` (e.g. an unexpected shape) THEN `checkoutUrl` SHALL be `''` (mirrors Asaas empty-string fallback; the route still returns it)
- WHEN a webhook is valid but the subscription is unknown to us THEN `applyBillingEvent` returns `unknown_subscription` → 200 no effect
- WHEN events arrive out of order (deleted before paid) THEN the lifecycle guards it (canceled is terminal) — unchanged

## Requirement Traceability

| ID | Story | Status |
|---|---|---|
| STRIPE-01 | createSubscription (form-encode, cents as-is) | Implemented |
| STRIPE-02 | cancelSubscription | Implemented |
| STRIPE-03 | verifyAndParseWebhook (HMAC + mapping) | Implemented |
| STRIPE-04 | factory routing (env-gate) | Implemented |
| STRIPE-05 | /webhooks/stripe route | Implemented |

## Success Criteria

- [ ] Unit: form-encoding correct, `unit_amount` = `priceCents` (399, NOT 3.99), headers, USD interval, `Grosify Pro`
- [ ] Unit: webhook HMAC valid (fixture signed in-test via `crypto`) / invalid / stale-timestamp → null; each event mapping; cancel 2xx/404/5xx
- [ ] Integration (pglite): valid `invoice.paid` → sub active + household pro; invalid signature → 401 no effect; duplicate event → no-op
- [ ] Factory: USD + `STRIPE_SECRET_KEY` → stripe; without key → null

## Honesty / Validation Status

**Live validation is PENDING a Stripe account.** No Stripe test key exists in this environment, so there is **no live end-to-end test** — the automated tests prove the *contract* (request shape, form-encoding, cents-as-minor-units), the *signature verification* (HMAC signed and checked in-test), and the *event mapping*. Real charge/webhook round-trips must be validated once an account exists. See the operational checklist (`docs/operational-setup-checklist.md`, Stripe section) for the go-live steps: open account, create the `/webhooks/stripe` endpoint with the 5 events, paste the 2 env vars.
