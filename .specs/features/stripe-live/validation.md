# Validation — stripe-live

**Verdict: PASS ✅** (with 1 ranked coverage gap, non-blocking)
**Scope:** commits `de2f36d..HEAD` (`b191878` adapter+factory, `f041a29` webhook). Spec re-read from `.specs/features/stripe-live/spec.md`.
**Verifier:** independent. No code changed. Only file written: this one.

---

## Gate

| Command | Result |
|---|---|
| `pnpm --filter @grosify/api test` | 389 passed / 29 files ✅ |
| `pnpm --filter @grosify/web test` | 41 passed / 10 files ✅ |
| `pnpm typecheck` | 6/6 tasks clean ✅ |

Matches expected (~389 / ~41).

---

## AC Coverage (spec-anchored)

Files: SP = `apps/api/src/billing/stripe-provider.test.ts`, FA = `apps/api/src/billing/factory.test.ts`, IT = `apps/api/src/test/billing-webhook-stripe.test.ts`, impl = `apps/api/src/billing/stripe-provider.ts`, route = `apps/api/src/routes/webhooks.ts`, idx = `apps/api/src/billing/index.ts`.

### P0 Create subscription (form-encoded)

| AC | Test file:line | Assertion | Outcome |
|---|---|---|---|
| 1 — POST /v1/customers then /v1/subscriptions, both form-urlencoded not JSON | SP:75-78, SP:98 | `subUrl === /v1/subscriptions`; `JSON.parse(body)` **throws**; `custUrl === /v1/customers` | ✅ form-encoded proven by JSON.parse throwing |
| 2 — `unit_amount` = priceCents EXACTLY, NO ÷100 ⭐ | SP:62-65, SP:117 | `unitAmount === '399'`; `!== '3.99'`; `!== '3'`; yearly `=== '2900'` | ✅ exact body value asserted; killed by mutation (a) |
| 3 — currency=usd, interval month/year, product name, payment_behavior, payment_settings, expand | SP:82-88, SP:116 | `currency==='usd'`, `interval==='month'`/`'year'`, `product_data[name]==='Grosify Pro'`, `payment_behavior==='default_incomplete'`, `save_default_payment_method==='on_subscription'`, `expand[]==='latest_invoice'` | ✅ all keys asserted on decoded form body |
| 4 — returns {externalId, externalCustomerId, checkoutUrl=hosted_invoice_url} | SP:154-158 | `toEqual({externalId:'sub_1', externalCustomerId:'cus_1', checkoutUrl:'https://stripe/pay/1'})` | ✅ |
| 5 — non-2xx → throw `stripe_<status>` | SP:177-179 | 402 → `rejects.toThrow(/stripe_402/)` | ✅ |
| 6 — every request carries Bearer + form-urlencoded Content-Type | SP:139-145 | both calls `toMatchObject({Authorization:'Bearer sk_minha_chave', 'Content-Type':'application/x-www-form-urlencoded'})` | ✅ |
| 7 — cpfCnpj ignored | SP:126-130 | no body contains `'12345678900'` or `'cpf'` | ✅ |

### P0 Cancel subscription

| AC | Test | Assertion | Outcome |
|---|---|---|---|
| 1 — DELETE /v1/subscriptions/{id} | SP:188-190 | `url === /v1/subscriptions/sub_1`; `method==='DELETE'` | ✅ |
| 2 — 2xx OR 404 resolves (idempotent) | SP:187, SP:195 | 200 → `resolves.toBeUndefined()`; 404 → same | ✅ |
| 3 — 5xx throws | SP:200-202 | 500 → `rejects.toThrow(/stripe_500/)` | ✅ |

### P0 Verify & parse webhook

| AC | Test | Assertion | Outcome |
|---|---|---|---|
| 1 — secret set + invalid HMAC → null | SP:263-267 (+ SP:231-234 unit) | `evt` toBeNull; `verifyStripeSignature(...,'v1=deadbeef')===false` | ✅ killed by mutation (d) |
| 2 — stale timestamp (>5min) → null | SP:270-277 (+ SP:237-243 unit) | `evt` toBeNull; `verifyStripeSignature` w/ ts-600 === false | ✅ killed by mutation (b) |
| 3 — event-type mapping (5 mapped + unmapped→null) | SP:287-352 | invoice.paid/succeeded→payment_confirmed; payment_failed→payment_overdue; sub.deleted→subscription_deleted; charge.refunded→payment_refunded; dispute.created→chargeback; invoice.created→null | ✅ all 6 branches asserted; payment_failed killed by mutation (c) |
| 4 — externalSubscriptionId per object + eventId=evt.id | SP:293-297, SP:324, SP:333 | invoice→`sub_9` (object.subscription), sub→`sub_7` (object.id), charge→`sub_5` (metadata.subscriptionId); `eventId==='evt_9'` | ✅ |
| 5 — no secret → warn + accept (dev) | SP:280-285 | warn spied; `evt.type==='payment_confirmed'` | ✅ |

### P1 Factory routing

| AC | Test | Assertion | Outcome |
|---|---|---|---|
| 1 — currency≠BRL + STRIPE_SECRET_KEY → StripeProvider | FA:31-32, FA:45-49 | `name==='stripe'`; `instanceOf StripeProvider` | ✅ |
| 2 — no STRIPE_SECRET_KEY → null (501) | FA:26-27 | `billingProviderFor('USD',{ASAAS_API_KEY:'k'})` toBeNull | ✅ |
| 3 — stub deleted, StripeProvider is concrete | FA:45-49 | not the throwing stub, usable instance | ✅ (also verified in impl: no `provider_unavailable` throw remains) |
| — BRL→asaas, never stripe | FA:21-24, FA:35-37 | BRL+key→asaas; USD+ASAAS_API_KEY→null (never asaas) | ⚠️ **partial** — see Gap G1 |

### P1 Webhook route

| AC | Test | Assertion | Outcome |
|---|---|---|---|
| 1 — invalid sig→401 no effect; bad payload→400; unmapped→200; try/catch always 200 | IT:115-124 (401), IT:173-176 (400), IT:161-170 (unmapped 200), IT:155-158 (unknown sub 200) | 401 + `subStatus` stays `pending` + `plan` stays `free`; 400 `bad_payload`; 200 no-op | ✅ |
| 2 — valid invoice.paid known stripe sub → active + household pro | IT:127-135 | `subStatus==='active'`; `housePlan==='pro'` | ✅ |
| 3 — same eventId twice → 2nd no-op (idempotent by provider='stripe',eventId) | IT:138-152 | both 200; `webhook_events` rows length === 1; `provider==='stripe'` | ✅ |

### Edge cases (inspection + tests)

| Edge | Evidence | Outcome |
|---|---|---|
| latest_invoice w/o hosted_invoice_url → checkoutUrl='' | SP:161-171 | `checkoutUrl===''` | ✅ |
| valid webhook, unknown sub → 200 no effect | IT:155-158 | 200 ok | ✅ |
| non-JSON payload but valid sig → null (adapter) / 400 (route) | SP:363-369, IT:173-176 | null / 400 | ✅ |
| customer.subscription.deleted → canceled (integration) | IT:179-195 | `subStatus==='canceled'` | ✅ |

### Operational checklist §Stripe

`docs/operational-setup-checklist.md:51-90` — section **1b. Stripe** exists with: 5 events listed (invoice.paid/succeeded, payment_failed, subscription.deleted, charge.refunded, dispute.created), endpoint URL `/webhooks/stripe`, both env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), pending-live-validation honesty note. ✅

---

## Sensor (mutation testing)

5 mutations, one at a time, `git checkout` + clean-status between each.

| # | Mutation | Site | Result | Killed by |
|---|---|---|---|---|
| a | `unit_amount: priceCents / 100` (the 100x reverse) | stripe-provider.ts:145 | **KILLED** | 2 fails: SP `399→399`, SP yearly `2900` |
| b | Remove 5-min timestamp tolerance (stale passes) | stripe-provider.ts:234 | **KILLED** | 2 fails: SP unit + SP webhook stale-timestamp |
| c | `invoice.payment_failed → payment_confirmed` | stripe-provider.ts:38 | **KILLED** | 1 fail: SP `payment_failed→payment_overdue` |
| d | `verifyStripeSignature` returns true always | stripe-provider.ts:222 | **KILLED** | 7 fails: 5 unit sig + IT 401 (+ integration) |
| e | Factory: BRL also routes to stripe when key present | index.ts:32 | **SURVIVED** ❌ | none (full 389-suite still green) |

**4/5 killed.** All spec-critical assertions (cents-as-minor-units, form-encoding, HMAC + 5-min tolerance, event mapping, 401-no-effect, idempotency) are sensor-verified. Mutation (e) survived → Gap G1.

---

## Ranked gaps

### G1 (low severity, non-blocking) — factory BRL-with-stripe-key path is untested

**What:** `factory.test.ts` never asserts that a **BRL** currency with `STRIPE_SECRET_KEY` set still returns Asaas (or null). Mutation (e) rerouted BRL→Stripe and the full 389-test suite stayed green. The existing guard test (`FA:35-37`, "moeda ≠ BRL nunca roteia pro Asaas") only covers the *reverse* direction.

**Why it matters (bounded):** Real risk is low — production BRL households route to Asaas by the `currency==='BRL'` branch, which is correct in the shipped code (verified `index.ts:32-36`). The gap is *test coverage*, not a behavioral defect. But if a future refactor reorders the branch, no test would catch a BRL→Stripe regression (a Brazilian household charged in USD via Stripe).

**Suggested fix (test-only, not applied — verifier does not edit code):** add to `factory.test.ts`:
```
it('BRL com STRIPE_SECRET_KEY presente ainda roteia pro Asaas (nunca Stripe)', () => {
  expect(billingProviderFor('BRL', { ASAAS_API_KEY: 'k', STRIPE_SECRET_KEY: 'sk' })?.name).toBe('asaas');
});
```

**Note:** This is a coverage observation, not a shipped-code defect. Spec AC (P1-Factory) is satisfied by the shipped implementation; the gap is only in the mutation-detection safety net.

---

## Tree

Clean except this file (`.specs/features/stripe-live/validation.md`). All 5 mutations reverted via `git checkout`; `git status --porcelain` empty before write. ✅

## Open questions

None. G1 is a documented low-severity test-coverage gap; shipped behavior is correct and spec-compliant.
