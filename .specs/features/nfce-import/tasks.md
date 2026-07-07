# Import NFC-e via QR — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: activate it by name and follow its Execute flow and Critical Rules (per-task cycle implement→gate→atomic commit, adequacy review, Verifier at the end). If the skill cannot be activated, STOP.

**Design**: `.specs/features/nfce-import/design.md`
**Status**: Ready for execution
**Orchestration**: 1 worker per phase (sequential, same worktree, current branch). Workers commit per task; they do NOT push/merge. Models per phase (rationale below): P1 sonnet · P2 opus · P3 opus · P4 opus · P5 sonnet · P6 haiku · Verifier opus.

**Model rationale**: P1 (pure parsing + schema, known pattern) = sonnet. P2 (fetch+parse of real portal HTML, 3 parsers + adapter, high detail risk) = opus. P3 (hybrid matching + embedding + cosine, subtle logic) = opus. P4 (routes + quota + cache + import state machine) = **opus** — quota/idempotency/cache correctness is the heart of the cost gate; an error here leaks money (external call) or bypasses the plan. P5 (client: scanner intercept + review + offline confirm, UI without a render harness) = sonnet. P6 (i18n + docs + state, mechanical) = haiku.

---

## Test Coverage Matrix

> Guidelines: global CLAUDE.md (run lint/tests; no mocks to pass the build) + existing harness. No threshold configured — strong defaults. Tests derive from the ACs.

| Code Layer | Test Type | Coverage Expectation | Location | Run Command |
|---|---|---|---|---|
| shared (parseNfceQr/ufFromChave/normalize/quota) | unit | all branches; v2+v3; valid/invalid state; 1:1 with the ACs | `apps/api/src/test/nfce-shared.test.ts` (imports @grosify/shared; shared has no runner of its own) | `pnpm --filter @grosify/api test` |
| parsers + adapter | unit (mocked fetch + HTML fixture) | each state: fixture→items; reais→cents conversion; CPF discarded; empty parse→error | `apps/api/src/nfce/parsers/*.test.ts`, `infosimples-adapter.test.ts` | same |
| matching + embedding | unit (mocked Gemini) | fuzzy resolves tokens; degrades without a key; ambiguous→embedding; empty catalog; embedding cache | `apps/api/src/nfce/matching.test.ts` | same |
| NfceLookup router | unit | RS key→svrs, SP→sp, MG→mg, SE±token, BA→uf_unsupported; setNfceLookup | `apps/api/src/nfce/router.test.ts` | same |
| routes + quota + cache | integration (pglite) | quota Free 2/Pro 60; cache doesn't count; typed errors; idempotency | `apps/api/src/test/nfce-routes.test.ts` | same |
| client intercept/confirm | unit (fake-indexeddb + fetch mock) | SEFAZ QR opens import; confirm creates price+item; source=import | `apps/web/src/**/nfce*.test.ts` | `pnpm --filter @grosify/web test` |
| UI review/scanner | none (no render harness) | typecheck + build gate | — | build gate |
| schema/migration/i18n/docs | none | build gate | — | build gate |

## Parallelism Assessment

| Test Type | Parallel-Safe? | Isolation | Evidence |
|---|---|---|---|
| api integration | per file yes (PGlite module-level), intra-file no (TRUNCATE beforeEach) | 1 PGlite per file | `db-integration.test.ts` |
| api/web unit | yes | fetch/idb mocked per file | vitest setup |

Sequential execution per phase (same worktree) — `[P]` is only free-order within the phase.

## Gate Check Commands

| Gate | When | Command |
|---|---|---|
| Quick-api | api-only task | `pnpm --filter @grosify/api typecheck && pnpm --filter @grosify/api test` |
| Quick-web | web-only task | `pnpm --filter @grosify/web typecheck && pnpm --filter @grosify/web test` |
| Build | end of phase / task without a test | `pnpm --filter @grosify/ui build && pnpm --filter @grosify/api typecheck && pnpm --filter @grosify/web typecheck && pnpm --filter @grosify/api test && pnpm --filter @grosify/web test` |

---

## Execution Plan

```
P1 (sonnet): T1 → T2                      foundation: shared (key/state/normalize/quota) + schema
P2 (opus):   T3 → T4 [P] → T5 [P] → T6    NfceLookup port + parsers SVRS/SP/MG + Infosimples adapter
P3 (opus):   T7 → T8                      fuzzy matching + Gemini embedding env-gated + cache
P4 (opus):   T9 → T10                     routes /nfce (lookup/cache) + quota Free/Pro + import machine
P5 (sonnet): T11 → T12 [P] → T13          client: scanner intercept + review screen + offline confirm
P6 (haiku):  T14 → T15                    i18n 6 languages + docs/operational checklist + STATE.md
Verifier (opus): post-T15, automatic
```

---

## Task Breakdown

### T1: Shared — key/state parsing, normalization, quota
**What**: `packages/shared/src/nfce.ts`: `parseNfceQr(rawValue)` (extracts the key from field 1 of `p=`, accepts v2 `chave|2|...` and v3 `chave|3|...`, null if non-SEFAZ); `ufFromChave(chave)` (2 IBGE digits→abbreviation, null if invalid); `NFCE_UF_ROUTES` (embedded copy of `uri_consulta_nfce.json`: abbreviation→{portalUrlTemplate, family}); `normalizeDescription(desc)` (uppercase/no accents/strip units+BR abbreviations); `NFCE_FREE_QUOTA=2`, `NFCE_PRO_QUOTA=60`, `nfceQuota(plan)`. Export in the index.
**Where**: `packages/shared/src/nfce.ts` (+ index) · tests `apps/api/src/test/nfce-shared.test.ts`
**Depends**: none · **Requirement**: NFCE-01/04 · **Tests**: unit · **Gate**: Quick-api
**Done when**: parseNfceQr resolves v2 and v3 and rejects a non-SEFAZ URL; ufFromChave maps IBGE codes; normalizeDescription deterministic; quota Free=2/Pro=60; tests 1:1 with the ACs.
**Commit**: `feat(nfce): shared key/state parsing, normalization and quota`

### T2: Schema — nfce_imports, embedding, cnpj, import source
**What**: migration 0027 (`db:generate`): `nfce_imports` table (unique(householdId,chave); status enum pending/parsed/confirmed/failed; itemCount; rawJson jsonb WITHOUT CPF; quota index (householdId,createdAt)); `items.embedding` jsonb null; `stores.cnpj` text null; add `'import'` to the `price_records.source` enum. Add `nfce_imports` to the harness TRUNCATE.
**Where**: `apps/api/src/db/schema.ts` · `apps/api/drizzle/0027_*` · `apps/api/src/test/db-integration.test.ts` (TRUNCATE)
**Depends**: none · **Requirement**: NFCE-02/04 · **Tests**: none (schema) · **Gate**: Build
**Done when**: the migration generates; unique(household,chave) present; source accepts 'import'; build green.
**Commit**: `feat(nfce): imports schema, embedding cache, store cnpj`

### T3: NfceLookup port + router + stub
**What**: `nfce/types.ts` (`NfceLookup`, `NfceResult`, `NfceItem` — NO CPF field); `nfce/index.ts` `lookupFor(uf)` router (family svrs/sp/mg→parser; infosimples→adapter if `INFOSIMPLES_TOKEN` otherwise error `state_unsupported`; null→`uf_unsupported`; `setNfceLookup()` for tests — mirror `email/index.ts`).
**Where**: `apps/api/src/nfce/{types,index}.ts` + `apps/api/src/nfce/router.test.ts`
**Depends**: T1 · **Requirement**: NFCE-05 · **Tests**: unit (RS key→svrs, SP→sp, MG→mg, SE without token→state_unsupported, BA→uf_unsupported; setNfceLookup injects a fake) · **Gate**: Quick-api
**Commit**: `feat(nfce): NfceLookup port with per-state routing`

### T4: Own parsers SVRS/SP/MG [P]
**What**: `nfce/parsers/{svrs,sp,mg}-parser.ts`: fetch (browser UA, `AbortSignal.timeout`, `turnstile.ts` template) + parse the HTML → `NfceResult`; **CPF never extracted**; reais→cents conversion (`round(valor*100)`, handle pt-BR comma); `<200 lines` each. Real HTML fixture per portal.
**Where**: `apps/api/src/nfce/parsers/{svrs,sp,mg}-parser.ts` + `*.test.ts` + `test/fixtures/nfce-{svrs,sp,mg}.html`
**Depends**: T3 · **Requirement**: NFCE-02 · **Tests**: unit — MANDATORY: fixture→N items; conversion "12,90"→1290 (100x risk); CPF absent from the result; parse of empty HTML→error (not empty items)
**Gate**: Quick-api · **Commit**: `feat(nfce): SVRS, SP and MG parsers for the SEFAZ portal`

### T5: Infosimples adapter (Sergipe) [P]
**What**: `nfce/infosimples-adapter.ts`: POST to the Infosimples API with `INFOSIMPLES_TOKEN` (env-gate; timeout; try/catch→`nfce_provider_error`); maps `produtos[]`→`NfceItem[]` (cents, unit, ean, ncm); discards CPF; without a token → not instantiable (the router returns `state_unsupported`).
**Where**: `apps/api/src/nfce/infosimples-adapter.ts` + `infosimples-adapter.test.ts` (mocked fetch)
**Depends**: T3 · **Requirement**: NFCE-05 AC3-4 · **Tests**: unit (JSON mock→items; cents conversion; missing token; network error→provider_error; CPF discarded)
**Gate**: Quick-api · **Commit**: `feat(nfce): Infosimples adapter for Sergipe (env-gated)`

### T6: Resilient fetch + typed lookup errors
**What**: consolidate the failure mapping in the router/parsers: portal timeout/HTTP≠200→`nfce_portal_error`; empty parse→`nfce_parse_failed`; adapter→`nfce_provider_error`; ensure NO path leaks raw HTML/CPF into the logs (log only {uf, partial key, family, status, itemCount}).
**Where**: `apps/api/src/nfce/index.ts`, parsers (typed error return) + `apps/api/src/nfce/errors.test.ts`
**Depends**: T4, T5 · **Requirement**: NFCE-07 · **Tests**: unit (each typed error; log contains no CPF/HTML)
**Gate**: Build (end of phase) · **Commit**: `feat(nfce): typed errors and safe logging (LGPD) in the lookup`

### T7: Hybrid fuzzy + embedding matching
**What**: `nfce/matching.ts`: `matchItems(itens, catalog)` — normalize (T1) + fuzzy token-set (`fuzzball`); high score→matched; ambiguous AND `GEMINI_API_KEY`→cosine; below the minimum→"new" (name pre-filled); empty catalog→everything new; NCM as an optional prior; **never throws without a key**. `nfce/embedding.ts`: `embed(texts)` Gemini @768d (batch) returns null without a key; cosine in memory.
**Where**: `apps/api/src/nfce/{matching,embedding}.ts` (+ `fuzzball` dep in api/package.json) + `matching.test.ts`
**Depends**: T1 · **Requirement**: NFCE-03 · **Tests**: unit — "ARROZ TP1 5KG CAMIL"→"Arroz" with fuzzy alone; without GEMINI_API_KEY doesn't call embed and doesn't throw; ambiguous uses cosine (mocked embed); empty catalog→everything new
**Gate**: Quick-api · **Commit**: `feat(nfce): hybrid fuzzy matching with optional Gemini embedding`

### T8: Catalog embedding cache
**What**: generate/persist `items.embedding` on item create/rename (only when `GEMINI_API_KEY`); matching reuses the column and only embeds items without a cache; an invalidation helper on rename. Without a key → the column stays null, matching uses fuzzy.
**Where**: `apps/api/src/nfce/embedding.ts` (cache helper), a hook on item create/update (`routes/catalog.ts`) + `apps/api/src/test/nfce-embedding-cache.test.ts` (pglite)
**Depends**: T2, T7 · **Requirement**: NFCE-03 AC6 · **Tests**: integration (cache reused; a new item generates; without a key→null, matching ok)
**Gate**: Quick-api · **Commit**: `feat(nfce): per-item catalog embedding cache`

### T9: /nfce/lookup route + import machine + cache
**What**: `routes/nfce.ts`: `POST /nfce/lookup {chave,url}` (requireHousehold; zValidator): **cache first** (key exists→returns rawJson, status already parsed, does NOT count toward quota); otherwise `lookupFor(uf)`; success→writes `nfce_imports` status `parsed` + itemCount + rawJson (no CPF) + returns items+matching; lookup errors→status `failed` + typed code (uf_unsupported 422, state_unsupported 501, portal 504, provider 502, parse 422) **without counting toward quota**. `GET /nfce/imports` (lists the month). Mount in `index.ts:46-53`.
**Where**: `apps/api/src/routes/nfce.ts` · `apps/api/src/index.ts` · `apps/api/src/test/nfce-routes.test.ts`
**Depends**: T3, T7 · **Requirement**: NFCE-02/07 · **Tests**: integration (fake lookup via setNfceLookup: happy→parsed+items; cache hit doesn't re-query; each typed error; idempotency unique(household,chave))
**Gate**: Quick-api · **Commit**: `feat(nfce): lookup route with cache and import state machine`

### T10: Free/Pro quota gate
**What**: in `POST /nfce/lookup`, BEFORE the portal: count `nfce_imports` for the calendar month (status IN parsed/confirmed) per `c.get('plan')` — Free≥2→403 `nfce_quota_free`, Pro≥60→429 `nfce_quota_pro`; cache hits and `failed` lookups do NOT count.
**Where**: `apps/api/src/routes/nfce.ts` (+ counting helper) + `apps/api/src/test/nfce-quota.test.ts`
**Depends**: T9 · **Requirement**: NFCE-04 · **Tests**: integration — 2 Free imports→3rd 403; flip to pro→ok; 60 pro→61st 429; a re-scan of an existing key doesn't increment; a failed lookup doesn't increment; month turnover resets
**Gate**: Build (end of phase) · **Commit**: `feat(nfce): monthly Free/Pro quota gate on import`

### T11: Client — scanner intercept + lookup service
**What**: (a) in the ScannerModal caller (compra-page, standalone), `parseNfceQr(rawValue)`→opens import; otherwise the current behavior; (b) `lib/nfce-import.ts`: `POST /nfce/lookup`, maps errors→`errors.*`, returns `MatchResult[]`; (c) a standalone route in `router.tsx` (`compraRoute:135` pattern) + an "Import receipt" button in the post-purchase Summary (`compra-page.tsx:528+`).
**Where**: `apps/web/src/lib/nfce-import.ts`, `apps/web/src/pages/compra-page.tsx`, `apps/web/src/router.tsx`, new `pages/importar-nota-page.tsx` + `apps/web/src/lib/nfce-import.test.ts`
**Depends**: T9 · **Requirement**: NFCE-01 · **Tests**: unit (a SEFAZ QR triggers import; a product QR doesn't; error→translatable code)
**Gate**: Quick-web · **Commit**: `feat(web): scanner intercepts an NFC-e QR and calls lookup`

### T12: Client — review screen [P]
**What**: `features/nfce/nfce-review.tsx` + subcomponents (<200 lines each): lists `MatchResult[]`; per line matched(swap)/new(create inline, name pre-filled)/ignore; edit price/qty; 1 step to match/create a store by CNPJ (reuses the `unknown-barcode-sheet:24` pattern).
**Where**: `apps/web/src/features/nfce/{nfce-review,nfce-line-row,nfce-store-step}.tsx`
**Depends**: T11 · **Requirement**: NFCE-06 · **Tests**: none (UI; typecheck) · **Gate**: Quick-web (typecheck)
**Commit**: `feat(web): NFC-e item review screen`

### T13: Client — offline confirm (price + item opt-in)
**What**: confirm the review: per non-ignored line→`recordPrice(itemId, storeId, priceCents, brandId, source:'import')` (repository+outbox); "create" lines→`createItem`+`addBarcode(ean)` BEFORE the price; match/create a `store` by CNPJ. Extend `recordPrice`/Dexie schema for `source:'import'`.
**Where**: `apps/web/src/db/repositories.ts` (import source), `features/nfce/nfce-review.tsx` (confirm) + `apps/web/src/db/nfce-confirm.test.ts`
**Depends**: T2, T12 · **Requirement**: NFCE-06 AC3 · **Tests**: unit (confirm creates N prices source=import; a "create" line creates item+barcode before the price; an ignored one doesn't save)
**Gate**: Build (end of phase) · **Commit**: `feat(web): import confirmation creates prices and opt-in items`

### T14: i18n — 6 locales
**What**: `nfce.*` keys (import button, review, matched/new/ignore, store, quota-reached) and `errors.*` (`uf_unsupported`, `state_unsupported`, `nfce_invalid_qr`, `nfce_invalid_key`, `nfce_parse_failed`, `nfce_portal_error`, `nfce_provider_error`, `nfce_quota_free`, `nfce_quota_pro`) in pt (source) + en/es/it/de/fr — identical structure across all 6.
**Where**: `apps/web/src/i18n/locales/{pt,en,es,it,de,fr}.ts`
**Depends**: T11-T13 · **Requirement**: NFCE-06/07 · **Tests**: none · **Gate**: Quick-web (typecheck catches a missing key)
**Commit**: `feat(i18n): NFC-e import strings in all 6 languages`

### T15: Docs (operational checklist) + env + STATE.md
**What**: (a) **create `docs/operational-setup-checklist.md`** consolidating EVERYTHING the owner needs to do to turn the feature on — an explicit user request (detail in the block below); (b) `.env.example` + `apps/api/.env.example`: `GEMINI_API_KEY`, `INFOSIMPLES_TOKEN` commented with a note "without them: fuzzy matching / SE unavailable"; (c) STATE.md: a decision line for 2026-07-05 (nfce-import feature, scope/gates/states/LGPD); (d) mark tasks done in this file.
**Where**: `docs/operational-setup-checklist.md` (new), `.env.example`, `apps/api/.env.example`, `.specs/project/STATE.md`, this file
**Depends**: T1-T14 · **Requirement**: — · **Tests**: none · **Gate**: final Build
**Commit**: `feat(nfce): operational checklist, example env and state record`

> **Mandatory content of `docs/operational-setup-checklist.md`** (consolidates billing + nfce — the owner reads 1 doc): Asaas (sandbox → prod: API key, webhook token, base URL); R2 (enable + S3 token in Cloudflare, `R2_*`); Turnstile (optional, `TURNSTILE_SECRET` + sitekey); **`GEMINI_API_KEY`** (create in AI Studio; without it matching falls back to fuzzy — the feature works); **Infosimples** (create an account, `INFOSIMPLES_TOKEN`, **a pricing/trial decision to turn Sergipe on** — R$100/month floor; without a token SE stays "state not yet supported"); **a validation test with a real receipt** (scan an actual RS/SP/MG NFC-e → check items/prices/store in the review before confirming). For each item: what to create, where, which env to set, and the behavior with/without the credential.

---

## Diagram-Definition Cross-Check

| Task | Depends (body) | Diagram | Status |
|---|---|---|---|
| T1/T2 | none | P1 start | ✅ |
| T3 | T1 | P2 after P1 | ✅ |
| T4/T5 | T3 | P2 [P] with each other | ✅ |
| T6 | T4,T5 | P2 end | ✅ |
| T7 | T1 | P3 | ✅ |
| T8 | T2,T7 | P3 (T2 in P1 ✓) | ✅ |
| T9 | T3,T7 | P4 after P2/P3 | ✅ |
| T10 | T9 | P4 | ✅ |
| T11 | T9 | P5 after P4 | ✅ |
| T12 | T11 | P5 [P] | ✅ |
| T13 | T2,T12 | P5 end | ✅ |
| T14 | T11-13 | P6 | ✅ |
| T15 | T1-14 | P6 last | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix requires | Task says | Status |
|---|---|---|---|---|
| T1 | shared logic | unit | unit | ✅ |
| T2 | schema | none | none (Build) | ✅ |
| T3 | router | unit | unit | ✅ |
| T4/T5 | parsers/adapter | unit + fixture | unit + fixture | ✅ |
| T6 | errors | unit | unit | ✅ |
| T7 | matching/embedding | unit | unit | ✅ |
| T8 | embedding cache | integration | integration | ✅ |
| T9/T10 | routes/quota | integration | integration | ✅ |
| T11 | client logic | unit | unit | ✅ |
| T12/T13 | UI/confirm | none/typecheck + unit(confirm) | same | ✅ |
| T14/T15 | i18n/docs/config | none | none | ✅ |

## Task status

- [x] T1 · [x] T2 · [x] T3 · [x] T4 · [x] T5 · [x] T6 · [x] T7 (abc5c62) · [x] T8 (1b4a3f1) · [x] T9 (5d83cdc) · [x] T10 (11ed6b1) · [x] T11 · [x] T12 · [x] T13 · [x] T14 (c38b8e2) · [x] T15 (this commit)

**Status**: Done (awaiting Verifier)
