# Pro Plan + Multi-Gateway Billing — Context

**Gathered:** 2026-07-05
**Spec:** `.specs/features/pro-plan-billing/spec.md`
**Status:** Ready for design

## Feature Boundary

Real Free/Pro gates + Pro subscription (monthly/yearly, BRL via Asaas live) + `PaymentProvider` strategy/DI port with a Stripe stub (501) routed by currency + plan UI in Settings + entitlement override (comp/100%).

## Implementation Decisions

### Free/Pro gates (user chose "the complete package")
- Free: 2 members, 30 items, 2 lists, 90d history
- Pro: unlimited + photos + price alerts + analytics + export
- Reactivates `maxItems` (currently suspended in `packages/shared/src/plans.ts`)

### Gateways (user chose "Asaas live + Stripe stub")
- Asaas functional: Pix, card, Pix Automático; env-gated (`ASAAS_API_KEY` absent → 501)
- Stripe: stub adapter 501; port/factory ready; routes `BRL→asaas, otherwise→stripe`
- Dependency inversion mirroring `apps/api/src/email/index.ts` (factory = the single place with concrete providers)

### Price/cycle (user chose "monthly + yearly")
- BRL: R$12,90/month, R$99/year — `PLAN_PRICES` in shared
- USD (Stripe future): $3.99/month, $29/year
- No lifetime

### Downgrade (user chose "read filter")
- Same pattern as `historyCutoff`: data above the cap becomes invisible, nothing deleted, returns on re-upgrade
- Deterministic rule: the 30 oldest items (createdAt asc) remain visible
- **Mandatory warning (user refinement):** the client shows a persistent warning with the count of what is hidden + a "upgrade reveals" CTA — invisible is never silent

### Agent's Discretion
- Exact shape of the `subscriptions` + `webhook_events` tables
- Paywall UX on the client (sheet vs banner)
- Polling vs focus-refetch after checkout

### Declined / Undiscussed Gray Areas → Assumptions (logged in the spec)
- Hosted checkout (redirect), 7d grace on overdue, comp via `planOverride`, owner/admin only, 1 active subscription per household

## Specific References
- "strategy with dependency inversion so the gateway is easy to swap" — explicit user request
- Reference pattern: the email layer (port + adapters + env-gate + noop)

## Deferred Ideas
- Stripe live (once there is an international paying customer)
- Launch lifetime deal; partial coupons; NFC-e scan as a Pro killer feature; retail media/cashback/B2B data
