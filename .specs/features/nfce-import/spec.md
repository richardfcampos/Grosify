# Import NFC-e via QR — Specification

## Problem Statement

Recording prices today is manual (typing item by item, or OCR of one price at a time in `check-item-sheet`). A supermarket fiscal receipt has 20-40 lines with description, quantity, and unit value — all already structured by SEFAZ and accessible via the receipt QR (the public lookup page displays the full DANFE with items, per the ENCAT specification). By scanning a QR, the app can import prices for an entire purchase in seconds and become a Pro killer feature. What's missing: querying + parsing the state portal (1 parser per portal family; no maintained OSS lib — we write our own), matching each line to the household catalog (receipt descriptions are abbreviated: "ARROZ TP1 5KG CAMIL"), reviewing and confirming, gated by plan.

## Goals

- [ ] Scan an NFC-e QR → review screen with matched/new items → confirm → `price_records` (always) + inventory
- [ ] Routing per state: own parsers (SVRS/SP/MG), env-gated paid adapter (SE via Infosimples), typed error for the rest — via a `NfceLookup` port (same pattern as email/billing)
- [ ] Hybrid matching that degrades on its own: fuzzy/normalization always; Gemini embedding only as a tiebreaker when `GEMINI_API_KEY` exists
- [ ] Gate: Free 2 imports/month (a taste); Pro unlimited with an invisible fair-use of 60/month (cost ceiling)
- [ ] LGPD: discard the consumer's CPF; keep only items + issuer (CNPJ) + key

## Out of Scope

| Feature | Reason |
|---|---|
| Receipt photo/OCR | MVP is QR only; image input is deferred |
| Manual access-key entry | The standalone-key lookup route has had reCAPTCHA since 2017 — unviable server-side |
| CF-e SAT model 59 (SP retail) | A different document (satsp.fazenda.sp.gov.br); the MVP is NFC-e model 65. SP here = model-65 receipts |
| WebView on the device for states with WAF | Evolution; the MVP covers SE via the paid adapter, other states = typed error |
| Pix Automático / charging | The feature is data import, not payment (billing is a separate feature) |
| Server→client batch pull-sync of entities | No batch endpoint exists today; import creates via repositories+outbox (offline-first) |
| Reselling an aggregated price base | Out of scope and vetoed by LGPD (identifiable data) |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| MVP input | QR only (scanner already reads `qr_code`) | Reliable 100% offline; the key is always field 1 of `p=` | y (user) |
| Free gate | 2 imports/month (a taste) | Shows the value, creates a reason to subscribe | y (user) |
| Pro gate | Unlimited + invisible fair-use 60/month | Cost ceiling (Infosimples/Gemini); never advertised | y (user) |
| Embeddings | Gemini `gemini-embedding-001` @768d, env-gated | #1 MTEB multilingual; the free tier covers the volume; degrades to fuzzy without a key | y (user) |
| Supported states | Own parsers SVRS/SP/MG + SE adapter (Infosimples); the rest → error | SVRS/SP/MG open (empirically confirmed); SE blocked (Turnstile) | y (user) |
| Cache | By access key (immutable receipt) | A re-scan doesn't re-query; idempotency + quota + cache in one place | y (user) |
| LGPD | Discard CPF; keep items + issuer (CNPJ) | The consumer queries their own receipt; CNPJ is public for a legal entity | y (user) |
| Imported prices | Always created; a new item is opt-in per line | The price is the core value; don't pollute the catalog without consent | y (user) |
| Server-side fetch | Browser UA; low volume; via the QR deep-link (never a lookup by key) | The deep-link has no captcha in most states; a standalone key does | y (research) |
| Receipt store | Match by CNPJ; `stores` has no CNPJ today → new column | The issuer identifies the store by CNPJ; the name changes | assumed (design decides) |
| `price_records.source` | New value `'import'` in the enum | Distinguishes an imported price from manual/shopping | assumed |
| Counter month | The household's UTC calendar month | Simple, no per-household timezone | assumed |

**Open questions:** see §Unresolved (design).

## User Stories

### P1: Scan a QR and import prices ⭐ MVP
As a household member, I scan the QR of my purchase's receipt, the app reads the receipt's items, matches them to my catalog, and I confirm to record the prices all at once.

**Acceptance Criteria:**
1. WHEN the user scans a QR whose `rawValue` is an NFC-e lookup URL (contains a 44-digit key in the 1st field of `p=`) THEN the app SHALL extract the key and the state (first 2 digits), and open the import flow — not treat it as a product barcode
2. WHEN the state has a parser/adapter and the portal responds THEN the server SHALL return structured items {description, quantity, unit, valorUnitCents, valorTotalCents} + issuer {cnpj, nome}
3. WHEN the items come back THEN the client SHALL show a review screen with each line classified as **matched** (a catalog item), **new** (no match), or **ignore**, all editable
4. WHEN the user confirms THEN the app SHALL create 1 `price_records` per non-ignored line with `source='import'` (via repository + outbox), and create a new item ONLY on the lines marked "create" (opt-in)
5. WHEN the same key was already imported in this household THEN the server SHALL return the cached result without re-querying SEFAZ (idempotent) and the client SHALL warn "receipt already imported"
6. WHEN the QR is v2 (`chave|2|tpAmb|idCSC|hash`) OR v3 (`chave|3|tpAmb`, mandatory since Nov/2025) THEN the key parser SHALL work with both (key = field 1 in both)

**Independent Test:** SVRS portal HTML fixture → the parser returns N items; POST /nfce/lookup with an RS key → items; confirm → N `price_records` created.

### P1: Hybrid matching that degrades ⭐ MVP
As a user, the abbreviated receipt descriptions ("ARROZ TP1 5KG CAMIL") are matched to my items ("Arroz") automatically, and the system works even without an embedding key configured.

**Acceptance Criteria:**
1. WHEN a receipt description contains a token that matches a catalog item exactly (after normalization: uppercase, no accents, stripping of units `\d+(KG|G|L|ML|UN)` and abbreviations) THEN the system SHALL match by fuzzy without calling embedding
2. WHEN fuzzy is ambiguous (score between thresholds) AND `GEMINI_API_KEY` exists THEN the system SHALL use cosine of the embeddings (cached catalog + query) to break the tie
3. WHEN `GEMINI_API_KEY` does NOT exist THEN matching SHALL use only fuzzy/normalization and never fail because of it (embedding is optional)
4. WHEN no candidate passes the minimum threshold THEN the line SHALL come marked "new" (a suggestion to create an item), with the name pre-filled from the receipt description
5. WHEN the household has no catalog (0 items) THEN all lines SHALL come "new" and the flow SHALL work (no error)
6. WHEN the catalog item's embedding is already cached (a column in the database) THEN the system SHALL reuse it without re-calling the API; only items without a cache (new/renamed) generate a call

**Independent Test:** unit — "ARROZ TP1 5KG CAMIL" matches "Arroz" with fuzzy alone; without `GEMINI_API_KEY`, the pipeline resolves and doesn't throw; empty catalog → everything "new".

### P1: Plan gate (taste + fair-use) ⭐ MVP
As a Free owner, I import 2 receipts/month to try it out; as Pro, I import without worrying (with an invisible safety ceiling).

**Acceptance Criteria:**
1. WHEN a Free household has already imported 2 receipts this month and tries the 3rd THEN the server SHALL respond 403 `nfce_quota_free` (the client shows a Pro paywall)
2. WHEN a Pro household has already imported 60 receipts this month and tries the 61st THEN the server SHALL respond 429 `nfce_quota_pro` (discreet "monthly limit reached" message, no paywall)
3. WHEN a re-scan of an already-imported key happens THEN it SHALL return from cache and NOT count toward the quota (it isn't a new import)
4. WHEN the quota is counted THEN only imports that actually queried (status `parsed`/`confirmed`) SHALL count; a failed lookup (portal down, state without a parser) does NOT consume quota
5. WHEN the month turns over THEN the counter SHALL reset (counted per calendar month via `createdAt`)

**Independent Test:** seed 2 Free imports in the month → 3rd lookup = 403; flip to pro → ok; 60 pro imports → 61st = 429; a re-scan of an existing key does not increment.

### P2: Routing per state via the `NfceLookup` port
As a dev, I add support for a state by creating a parser (or plugging in an adapter), without touching the caller.

**Acceptance Criteria:**
1. `NfceLookup` port (`lookup(chave, url): Promise<NfceResult>`) with a per-state router: SVRS/SP/MG → own parser; SE → Infosimples adapter if `INFOSIMPLES_TOKEN`; otherwise a typed error — the only place that knows concrete routes (mirrors `email/index.ts`)
2. WHEN the state is served by an own parser THEN the server SHALL fetch with a browser UA + timeout and parse the portal HTML
3. WHEN the state is Sergipe AND `INFOSIMPLES_TOKEN` exists THEN the server SHALL query via the Infosimples adapter (structured JSON)
4. WHEN the state is Sergipe AND `INFOSIMPLES_TOKEN` does NOT exist THEN the server SHALL respond 501 `state_unsupported`
5. WHEN the state has neither an own parser nor an adapter THEN the server SHALL respond 422 `uf_unsupported` (with the state abbreviation in the response so the UI can explain)
6. WHEN routing needs the per-state URL table THEN it SHALL be embedded in the code (a copy of `uri_consulta_nfce.json`), not a runtime dependency

**Independent Test:** unit for the router (RS key→svrs, SP→sp, MG→mg, SE without token→501, BA key→422); fake adapter in the integration tests.

### P2: Editable review screen
As a user, I review what the receipt brought before saving: I adjust the match, mark create/ignore, edit price/quantity.

**Acceptance Criteria:**
1. WHEN the review opens THEN each line SHALL show the receipt description, value, and the suggested match (item + confidence) with an option to swap/create/ignore
2. WHEN the user swaps a line's match THEN they SHALL be able to search for an existing item (reuses the picker) or create inline (name pre-filled from the receipt)
3. WHEN the user confirms THEN only non-ignored lines SHALL become `price_records`; "create" lines also create the item and link the receipt's EAN (if present) via `addBarcode`
4. WHEN the receipt's store (CNPJ) does not exist in `stores` THEN the flow SHALL offer to create/match the store (once per import), so the prices have a `storeId`
5. Screen strings in all 6 languages (`nfce.*`)

### P3: Error feedback per state/portal
As a user in an unsupported state or with a portal down, I understand what happened without a crash.

**Acceptance Criteria:**
1. WHEN the state is not supported THEN the client SHALL show a clear message ("import not yet available in {state}") via `errors.uf_unsupported`
2. WHEN the SEFAZ portal is down/slow (timeout) THEN the client SHALL show "portal unavailable, try again later" (`errors.nfce_portal_error`) without consuming quota
3. WHEN the QR is not NFC-e (any text/URL) THEN the import flow SHALL refuse gracefully (`errors.nfce_invalid_qr`) and not open the review

## Edge Cases

- WHEN the QR is illegible / rawValue doesn't match a SEFAZ URL pattern THEN refuse with `nfce_invalid_qr`, no lookup
- WHEN the key has 44 digits but the state (digits 1-2) isn't a valid IBGE code THEN `nfce_invalid_key`
- WHEN the portal HTML changed and the parser finds no items THEN return `nfce_parse_failed` (not silently empty items) — does not count toward quota, and there's a fixture test to detect the change
- WHEN the receipt was already imported (key exists) THEN return cache, warn, don't count toward quota, don't duplicate `price_records`
- WHEN the quota is exceeded (Free 2, Pro 60) THEN typed 403/429 BEFORE querying the portal (doesn't spend an external call)
- WHEN matching is ambiguous (2+ items tie) THEN the line comes "new"/"choose" — never silently matches wrong
- WHEN the line is a new item AND `GEMINI_API_KEY` is off THEN it works via fuzzy; the receipt item's NCM can suggest a category (a free bonus)
- WHEN the household has no catalog THEN everything "new"; confirming creates items + prices
- WHEN Infosimples is down / the token is invalid THEN `nfce_provider_error` 502, doesn't count toward quota
- WHEN two members scan the same receipt almost together THEN unique(household, chave) guarantees 1 record; the 2nd gets cache
- WHEN the receipt carries the consumer's CPF in the HTML/JSON THEN the parser SHALL discard it (never persist/log)

## Requirement Traceability

| ID | Story | Phase | Status |
|---|---|---|---|
| NFCE-01 | P1 key/state + scanner intercept | Design | Pending |
| NFCE-02 | P1 lookup+parse+cache/idempotency | Design | Pending |
| NFCE-03 | P1 hybrid matching (fuzzy+embedding) | Design | Pending |
| NFCE-04 | P1 quota gate Free/Pro | Design | Pending |
| NFCE-05 | P2 NfceLookup port + state routing | Design | Pending |
| NFCE-06 | P2 review screen + confirm | Design | Pending |
| NFCE-07 | P3 typed errors per state/portal | Design | Pending |

## Success Criteria

- [ ] Real RS/SP/MG receipt: scan → review → confirm → N correct `price_records`
- [ ] Without `GEMINI_API_KEY`: matching works via fuzzy, no embedding call
- [ ] Free hits 2/month (403); Pro hits 60/month (429); a re-scan doesn't count
- [ ] Adding a new state = 1 parser + 1 case in the router (fake in the tests)
- [ ] CPF never appears in the database or the logs

## Implicit-Dimensions Sweep (Large)

| Dimension | Resolution |
|---|---|
| Input validation | zod on the payload (44-digit numeric key; url); QR validated by SEFAZ pattern; state from the key, never the body |
| Failure/partial | portal down → `nfce_portal_error`; parse failed → `nfce_parse_failed`; adapter down → 502; none count toward quota |
| Idempotency/dedup | unique(household, chave) in `nfce_imports`; a re-scan = cache, doesn't duplicate prices or quota |
| Auth/rate limit | household-scoped (session key); import is a mutation (viewer blocked); quota is the business rate limit |
| Concurrency | unique(household,chave) serializes concurrent scans of the same receipt; quota counting reads current state (soft — scales for a 2-4 household) |
| Data lifecycle | `nfce_imports` stores items+issuer+key; CPF discarded; permanent cache (immutable receipt) |
| Observability | log of each lookup {state, key (hash/partial), route, status, # items}; never log CPF |
| External failure | env-gate 501 (SE without token); portal down 502/504 typed; Gemini optional degrades |
| State transitions | import: `pending`(created) → `parsed`(items ok) → `confirmed`(saved) OR `failed`(error, doesn't count toward quota) |
| i18n | `nfce.*` + `errors.*` (uf_unsupported, state_unsupported, nfce_invalid_qr, nfce_invalid_key, nfce_parse_failed, nfce_portal_error, nfce_provider_error, nfce_quota_free, nfce_quota_pro) in all 6 languages |
| Money | receipt values in decimal reais → convert to minor units (cents) on input; `price_records.priceCents` integer |
