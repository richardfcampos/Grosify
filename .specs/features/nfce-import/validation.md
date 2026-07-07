# Validation — nfce-import

**Verdict: PASS ✅**
**Verifier:** independent (non-author). Method: evidence-or-zero (file:line + assertion) + mutation sensor.
**Date:** 2026-07-06
**Commit range:** `2224ccb`..`0fb515e` (spec/design/tasks → HEAD). 15 tasks T1-T15 + v2 parse fix `fa70dd5` + vitest fix `0fb515e`.

---

## Gate

| Command | Result |
|---|---|
| `pnpm --filter @grosify/api typecheck` | ✅ pass (tsc --noEmit, 0 errors) |
| `pnpm --filter @grosify/web typecheck` | ✅ pass (0 errors; ui already built) |
| `pnpm --filter @grosify/api test` | ✅ **21 files, 276 tests, 0 failed** |
| `pnpm --filter @grosify/web test` | ✅ **5 files, 22 tests, 0 failed** (2 nfce + 3 pre-existing) |

Counts match expectations (~276 api / ~22 web). No failures, no suspicious skips.

---

## Coverage anchored in the spec (per AC)

### P1 — Scan a QR and import prices (NFCE-01/02)

| AC | Evidence | Outcome |
|---|---|---|
| 1 — SEFAZ URL QR → extracts key+state, opens import (doesn't treat as product) | `nfce-shared.test.ts:19-76` (parseNfceQr) + `nfce-import.test.ts:18-26` (isNfceQr true for SEFAZ, false for product) | ✅ key extracted, product refused |
| 2 — served state → items {desc,qty,unit,unitCents,totalCents}+issuer{cnpj,nome} | `svrs-parser.test.ts:20-49`, `sp-parser.test.ts:14-43`, `infosimples-provider.test.ts:66-101`; route `nfce-routes.test.ts:149-171` | ✅ full shape + cents |
| 3 — review screen matched/new/ignore editable | inspection: `nfce-review.tsx:100-177` + `nfce-line-row.tsx:33-137` (match→swap, new→create inline, ignore toggle, qty/price editable) | ✅ by inspection |
| 4 — confirm creates 1 price/line source='import'; new item only opt-in | `nfce-confirm.test.ts:48-91` (matched→1 price source=import, 0 new item), `:93-124` (new→item+price) | ✅ `prices[0].source==='import'` |
| 5 — same key cached, without re-querying, warns | `nfce-routes.test.ts:183-212` (cached:true, fetchItems 1x, alreadyImported true) | ✅ |
| 6 — QR v2 AND v3 work (key=field 1) | `nfce-shared.test.ts:20-43` (v2 5/6/8 fields + v3 3/4 fields) | ✅ both |

### P1 — Hybrid matching that degrades (NFCE-03)

| AC | Evidence | Outcome |
|---|---|---|
| 1 — exact token post-normalization matches via fuzzy without embedding | `matching.test.ts:23-29` ("ARROZ TP1 5KG CAMIL"→arroz, method fuzzy, conf>0.7) | ✅ |
| 2 — ambiguous AND GEMINI_API_KEY → cosine breaks the tie | `matching.test.ts:111-126` (MACARRAO→massa via mocked embed, method embedding) | ✅ |
| 3 — without GEMINI_API_KEY → fuzzy only, never fails | `matching.test.ts:84-93` (fetch not called, resolves fuzzy) | ✅ |
| 4 — below the threshold → "new" name pre-filled | `matching.test.ts:39-42,95-100` (suggestedName='ARROZ 5KG') | ✅ |
| 5 — empty catalog → everything "new", no error | `matching.test.ts:43-45,95-100`; route `nfce-routes.test.ts:173-179` | ✅ |
| 6 — cached embedding reused; only non-cached calls the API | `nfce-embedding-cache.test.ts:70-113` (cache hit without fetch; partial batch only for the pending ones) | ✅ |

### P1 — Plan gate (NFCE-04)

| AC | Evidence | Outcome |
|---|---|---|
| 1 — Free 2/month → 3rd = 403 `nfce_quota_free` | `nfce-quota.test.ts:142-154` (status 403, exact body, doesn't save the 3rd) | ✅ |
| 2 — Pro 60/month → 61st = 429 `nfce_quota_pro` | `nfce-quota.test.ts:168-176` (429 + body); boundary `:178-185` (59→60th passes) | ✅ `>=60` |
| 3 — cached re-scan does NOT count toward quota | `nfce-quota.test.ts:207-219` (5 re-scans, used=1, 2nd import passes) | ✅ |
| 4 — only parsed/confirmed count; failed doesn't | `nfce-quota.test.ts:189-205` (3 BA-failed don't consume Free) | ✅ |
| 5 — month turnover resets the counter | `nfce-quota.test.ts:222-238` (lastMonth doesn't count, used=0) | ✅ (UTC window `nfce-import-service.ts:63-79`) |

### P2 — Routing per state via the NfceLookup port (NFCE-05)

| AC | Evidence | Outcome |
|---|---|---|
| 1 — port + single router; svrs/sp/mg parser, SE adapter±token, otherwise error | `router.test.ts:43-127` + `index.ts:55-90` | ✅ mirrors email/index |
| 2 — state with parser → fetch browser UA + parse HTML | `portal-fetch.ts:29-67` (BROWSER_UA, timeout, retry); `errors.test.ts:36-44` | ✅ |
| 3 — SE + INFOSIMPLES_TOKEN → JSON adapter | `infosimples-provider.test.ts:144-148`, `router.test.ts:71-75` | ✅ |
| 4 — SE without token → 501 `state_unsupported` | `router.test.ts:77-87`, `nfce-routes.test.ts:237-243` (501) | ✅ |
| 5 — state without route → 422 `uf_unsupported` with abbreviation | `router.test.ts:89-99` (uf=BA), `nfce-routes.test.ts:225-235` (422, body.uf=BA) | ✅ |
| 6 — URL table embedded in the code | `packages/shared/src/nfce.ts:173-203` (NFCE_UF_ROUTES const); `nfce-shared.test.ts:135-160` | ✅ |

### P2 — Editable review screen (NFCE-06)

| AC | Evidence | Outcome |
|---|---|---|
| 1 — each line: desc, value, match+confidence, swap/create/ignore | inspection `nfce-line-row.tsx:43-119` | ✅ by inspection |
| 2 — swap match: search existing OR create inline | inspection `nfce-line-row.tsx:121-198` (ItemPickerSheet: search + create) | ✅ by inspection |
| 3 — confirm: only non-ignored→price; "create"→item+addBarcode(EAN) | `nfce-confirm.test.ts:93-147` (item+barcode before the price; no EAN→no barcode), `:149-162` (empty list→0) | ✅ |
| 4 — store by CNPJ: match/create 1x per import | `nfce-confirm.test.ts:164-227` (reuses by CNPJ; creates a new one with cnpj); inspection `nfce-store-step.tsx:25-58` | ✅ |
| 5 — strings in all 6 languages (`nfce.*`) | `nfce:` block present in pt/en/es/it/de/fr | ✅ (grep 6/6) |

### P3 — Error feedback per state/portal (NFCE-07)

| AC | Evidence | Outcome |
|---|---|---|
| 1 — unsupported state → `errors.uf_unsupported` | `nfce-import.ts:54-71,88-92` (code→NfceImportError); locale key 6/6 | ✅ |
| 2 — portal timeout → `nfce_portal_error` without quota | `nfce-import.test.ts:76-85`; `nfce-routes.test.ts:245-259` (504, status failed) | ✅ |
| 3 — non-NFC-e QR → `nfce_invalid_qr`, doesn't open the review | `nfce-import.test.ts:68-74` (refuses without calling the server) | ✅ |

### Edge Cases (spec §Edge Cases)

| Edge | Evidence | Outcome |
|---|---|---|
| illegible QR/non-URL rawValue → `nfce_invalid_qr` without lookup | `nfce-shared.test.ts:69-75`; `nfce-routes.test.ts:216-223` | ✅ |
| 44-digit key but invalid state → `nfce_invalid_key` | `nfce-shared.test.ts:125-128` (ufFromChave null); route `nfce.ts:85-87` | ✅ |
| HTML changed, 0 items → `nfce_parse_failed`, not silently empty | `svrs-parser.test.ts:87-103`, `sp-parser.test.ts:52-68`, `errors.test.ts:46-53` | ✅ |
| receipt already imported → cache, warns, doesn't count, doesn't duplicate | `nfce-routes.test.ts:183-212` | ✅ |
| quota exceeded BEFORE the portal | `nfce.ts:104-111` (quota before lookupFor); `nfce-quota.test.ts:152-154` (doesn't save) | ✅ |
| ambiguous matching (tie) → "new", never matches wrong | `matching.test.ts:47-54` (REFRIGERANTE ties→null) | ✅ |
| empty catalog → everything new | covered in NFCE-03 AC5 | ✅ |
| Infosimples down/invalid token → `nfce_provider_error` 502 | `infosimples-provider.test.ts:112-141`; `nfce-routes.test.ts:261-274` | ✅ |
| 2 members same receipt → unique(household,chave) 1 record, 2nd cache | migration `0027:12` unique + `nfce-routes.test.ts:198` (1 row) | ✅ |
| CPF in HTML/JSON → discarded, never persisted/logged | `svrs-parser.test.ts:51-57,80-84`, `sp-parser.test.ts:45-49`, `infosimples-provider.test.ts:103-109`, `errors.test.ts:89-119` (log) | ✅ |

**Total: 34/34 ACs covered by file:line + Edge Cases. Pure UI (NFCE-06 AC1/AC2, review/store) verified by inspection (component + condition + i18n keys 6/6).**

---

## Audit of the Phase 5 deviations (server contracts extended in a client phase)

| Deviation | Additive? | Breaks a consumer? | Tested? | Verdict |
|---|---|---|---|---|
| The lookup response gains raw `itens` | Yes (a new field in the route response, not in the sync wire) | No — existing consumers don't read this route | `nfce-routes.test.ts:161-170`, `nfce-import.test.ts:64-65` | ✅ ok |
| `cnpj` in the stores wire (schema/payload/route) | Yes — `storeSchema.cnpj nullable`, `createStorePayload.cnpj optional`, catalog route `p.cnpj ?? null` | No — nullable+optional; existing POST /stores without cnpj → null | schema `index.ts:68-70`; `nfce-confirm.test.ts:204-227` (cnpj saved) | ✅ ok |
| `'import'` in PRICE_SOURCES/createPricePayload/prices route | Yes — additive enum with `default('manual')`; `source: p.source ?? 'manual'` | No — callers without a source → 'manual' (behavior identical to before; the shopping.ts diff is 1 backward-compat line) | `nfce-confirm.test.ts:85,123` (source=import); repository `recordPrice:509-538` threading it into the body | ✅ ok |

All 3 deviations are **purely additive and backward-compatible**; no existing consumer breaks (typecheck + 276 green tests confirm).

### Other audited points of attention

- **v2 parse 5-8 fields (fix `fa70dd5`)**: the test **pins exactly 5 fields** — `nfce-shared.test.ts:20-23` (`chave|2|1|1|A1B2C3D4E5F6`); + 6 (`:25`), + 8 (`:30`), + rejects <5 (`:64-67`). Regression guard present. ✅
- **{qrUrl} payload re-validated server-side** (design said {chave,url}): the route derives key/state from `parseNfceQr(qrUrl)` + `ufFromChave` (`nfce.ts:82-87`) — **the state never comes from the body** (satisfies spec §Implicit-Dimensions "state from the key, never the body" and NFCE-01 AC1). The design deviation **improves** the posture (the key isn't trusted from the client). The ACs remain satisfied. ✅
- **LGPD rawJson without CPF**: the parser never extracts CPF (svrs/sp/mg reuse `svrs-html`/`sp-html`, no CPF selector); the adapter discards it; the log masks the key (8 digits) and only carries `{uf,status,chave}`. Proved by a test on every path (parsers + adapter + log). Mutation 6 confirms. ✅

---

## Mutation sensor (7 mutations, 7 killed, 0 survived)

| # | Mutation | File:location | Test that caught it | Result |
|---|---|---|---|---|
| 1 (a) | quota Free `>=` → `>` (off-by-one lets the 3rd pass) | `routes/nfce.ts:106` | `nfce-quota.test.ts:149` | **KILLED** |
| 2 (b) | cache: `findCachedImport` always returns null | `nfce-import-service.ts:49` | `nfce-routes.test.ts:209` + quota re-scan (2 failures) | **KILLED** |
| 3 (c) | cents conversion `*100` → `*10` | `parsers/html-parse.ts:37` | 6 parser tests (100x risk) | **KILLED** |
| 4 (d) | remove the >1% total divergence guard | `parsers/html-parse.ts:150` | `svrs-parser.test.ts:119` | **KILLED** |
| 5 (e) | invert the fuzzy threshold (`<` → `>`) | `matching.ts:114` | 4 matching tests | **KILLED** |
| 6 (g) | LGPD: parser leaks the consumer's CPF into the issuer | `parsers/svrs-html.ts:68` | 3 LGPD tests (RS+MG) | **KILLED** |
| 7 (f) | status machine: `failed` → `parsed` (failed would count toward quota) | `nfce-import-service.ts:140` | 4 tests (route error status + quota "failed doesn't count") | **KILLED** |

Covers the most critical points: the cost gate (quota/cache/status), monetary correctness (cents/divergence), matching, and LGPD. **0 survivors** = the suite kills mutants at the heart of the cost gate, the money, and the privacy.

---

## Ranked gaps

No blocking gaps. Minor observations (non-blocking, no action required):

1. **(informative) `parseNfceQr` requires a known SEFAZ host** (`nfce.ts:40,67-84`) — a valid NFC-e QR from a state whose host isn't in `KNOWN_SEFAZ_HOSTS` would be refused as `nfce_invalid_qr` even with a valid key. It's a **stricter restriction** than the spec (which only requires a 44-digit key in field 1); it may refuse legitimate receipts from unlisted hosts until the list grows. Consistent with "MVP covers confirmed states". Not a regression.
2. **(informative) Review UI coverage is by inspection** (no render harness) — aligned with the tasks' Test Coverage Matrix (`review UI/scanner: none, typecheck+build gate`). The confirm logic (what gets saved) IS tested (`nfce-confirm.test.ts`). Acceptable by design.

---

## Final tree

`git status --short`: **clean** except `validation.md` (this file) + `tasks.md` (status marker, already present before the verification). **No code file touched** — all 7 mutations reverted and confirmed clean via `git checkout` + `git status --short`.
