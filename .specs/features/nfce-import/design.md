# Import NFC-e via QR — Design

**Spec**: `.specs/features/nfce-import/spec.md`
**Context**: `.specs/features/nfce-import/context.md`
**Status**: Draft (awaiting approval)
**Research base**: 4 reports (QR/SEFAZ feasibility, third-party APIs, embeddings, integration scout) — the file:line/URLs cited below come from those.

---

## Approaches considered (Large → mandatory exploration)

### Lookup route (how to obtain the receipt items)

| | Approach | Trade-off |
|---|---|---|
| **A (recommended)** | **QR deep-link, server-side fetch+parse per state** + paid adapter only for blocked states | ✅ zero cost in open states (SVRS/SP/MG confirmed HTTP 200 with no captcha today); ✅ complete data per ENCAT. ❌ 1 parser per portal family; breaks when SEFAZ redesigns (mitigated by fixture) |
| B | Single paid API for everything (Infosimples, 27 states) | ✅ 1 integration, clean JSON, covers SE. ❌ R$100/month floor regardless of volume; per-query cost on every receipt; hard external dependency |
| C | Manual lookup by key (no QR) | ❌ reCAPTCHA since 2017 in several states; unviable server-side. Discarded |
| D | WebView on the device (the request leaves from the user's IP/browser) | ✅ works around WAF/Turnstile for free (the intended use per the tax authority). ❌ parsing on the client, webview UX, more surface. Kept as an evolution for SE |

**Choice: A + paid fallback only where A doesn't work.** Own parsers for the open states (zero cost, low volume); Sergipe (Turnstile confirmed) via Infosimples env-gated; other states = typed error until we have a parser. B is noted as the path if the number of blocked states grows. D (WebView) is the natural evolution for SE at no cost.

### Matching (matching a receipt description to the catalog)

| | Approach | Trade-off |
|---|---|---|
| **Hybrid (recommended)** | Normalization + fuzzy token-set first; **embedding only for the unresolved ones** | ✅ ~80-90% resolved with tokens alone (the category appears literally in the description); embedding is the minority; degrades without a key. ❌ 2 code paths |
| Embedding only | Cosine of everything against everything | ❌ an API call per line always; breaks without a key; cost/latency wasted on repeat purchases |
| Fuzzy only | No embedding at all | ✅ zero external dep. ❌ misses opaque synonyms ("MACARRAO ESPAGUETE"→"Massa") |
| pgvector | Vector index in Postgres | ❌ overkill: ≤200 items/household = 0.6 MB, cosine in memory <1ms. New infra for nothing |

**Choice: hybrid, cosine in memory, no pgvector.** Embedding is **optional** (env-gated Gemini). Catalog cached in a column; the query is embedded only when fuzzy ties.

---

## Architecture Overview

```mermaid
graph TD
    QR[ScannerModal reads qr_code] -->|rawValue = SEFAZ URL?| ICT[caller: detects SEFAZ pattern<br/>extracts key+state]
    ICT -->|POST /nfce/lookup {chave,url}| RT[routes/nfce.ts<br/>requireHousehold]
    RT --> Q{quota: nfce_imports<br/>count for the month}
    Q -->|Free>=2| E403[403 nfce_quota_free]
    Q -->|Pro>=60| E429[429 nfce_quota_pro]
    Q -->|cache hit key| CACHE[returns cached items<br/>does not count toward quota]
    Q -->|ok| F[nfce/index.ts router<br/>lookupFor state]
    F -->|SVRS/SP/MG| P[own parsers<br/>fetch browser UA + parse HTML]
    F -->|SE + INFOSIMPLES_TOKEN| INFO[infosimples-adapter.ts]
    F -->|SE without token| E501[501 state_unsupported]
    F -->|state without route| E422[422 uf_unsupported]
    P --> ITEMS[NfceResult: items + issuer<br/>CPF discarded]
    INFO --> ITEMS
    ITEMS --> M[nfce/matching.ts<br/>normalize+fuzzy → embedding if ambiguous]
    M -->|GEMINI_API_KEY?| G[(Gemini embed<br/>optional)]
    M --> REV[client: review screen<br/>matched/new/ignore editable]
    REV -->|confirm| REPO[repositories: recordPrice source=import<br/>+ createItem opt-in + store by CNPJ]
    REPO --> OUT[outbox → POST /shopping/prices etc.]
```

**Source of truth = our database (offline-first).** The lookup is server-side (env-gated port), but the **writing** follows the project pattern: the client creates via Dexie repositories + outbox — there is no batch endpoint. The server stores the queried receipt (`nfce_imports`) for cache/quota/idempotency; the `price_records`/items flow through the outbox like any mutation.

**Dependency inversion (same as the billing/email ask):** a `NfceLookup` port + router (the only place that knows concrete states) + `setNfceLookup()` for tests. A new state = 1 parser + 1 case.

---

## Code Reuse Analysis

| Existing | Location | Use |
|---|---|---|
| Scanner already reads QR | `apps/web/src/features/scanner/use-barcode-scanner.ts:5,16` | The NFC-e URL (~130+ chars) passes the `acceptValue` of `qr_code`; the caller distinguishes by SEFAZ URL pattern |
| ScannerModal `{onDetect,onClose}` | `apps/web/src/features/scanner/scanner-modal.tsx:11` | Reuse; open from post-purchase (`compra-page.tsx:528+`, "attach receipt" slot `:715-737`) and standalone |
| Unknown-QR intercept | `apps/web/src/pages/compra-page.tsx:108` (`resolveBarcode==null → UnknownBarcodeSheet`) | A cheap point to intercept a receipt QR BEFORE resolveBarcode |
| Port/factory/env-gate pattern | `apps/api/src/email/index.ts:20` (factory+noop+setProvider) | Copy into `nfce/index.ts` (router per state + setNfceLookup for tests) |
| External fetch env-gate | `apps/api/src/lib/turnstile.ts:10` (passthrough/fail-closed + `AbortSignal.timeout`) | Template for the SEFAZ portal fetch and the Infosimples adapter (timeout + try/catch → typed error) |
| Env-gate #1 (R2) | `apps/api/src/lib/r2.ts:14` (`const enabled = Boolean(...)` + 501) | Template for `INFOSIMPLES_TOKEN`/`GEMINI_API_KEY` |
| Household-scoped route | `apps/api/src/routes/shopping.ts:211` (POST /prices; zValidator + onConflictDoNothing + FK→409) | Template for `routes/nfce.ts` (`.use(requireHousehold)`, mounted in `index.ts:46-53`) |
| Effective plan on the request | `apps/api/src/middleware/household.ts:52` (`resolveEffectivePlan` → `c.get('plan')`) | The quota gate reads `c.get('plan')` to choose 2 vs 60 |
| Line-by-line reconciliation | `apps/web/src/features/brands/unknown-barcode-sheet.tsx:24` (search OR create inline + BrandPicker + addBarcode) | Ready-made pattern for the review: the receipt description pre-fills the name (in place of OpenFoodFacts) |
| Offline price write | `apps/web/src/db/repositories.ts:505` (`recordPrice` → Dexie put + enqueue POST /shopping/prices) | Import calls the same path; **new `source:'import'`** |
| Barcode→item match | `apps/web/src/db/repositories.ts:280` (`resolveBarcode`), `:132` (`addBarcode`) | The receipt EAN links an item on confirmation |
| pglite harness | `apps/api/src/test/db-integration.test.ts` | Lookup/quota/cache (add `nfce_imports` to the TRUNCATE) |
| fake-indexeddb harness | `apps/web` vitest.setup | Preflight/confirm on the client |
| uuidv7 time-ordered | ids for all rows | No extra ordering column |

---

## Components

### 1. `packages/shared/src/nfce.ts` (new — pure parsing, testable, no I/O)
- `parseNfceQr(rawValue): { chave: string; url: string } | null` — accepts the QR URL; extracts field 1 of `p=` (44-digit key); validates v2 (`chave|2|...`) and v3 (`chave|3|...`); returns null if it isn't a SEFAZ pattern (→ `nfce_invalid_qr`)
- `ufFromChave(chave): Uf | null` — the first 2 digits = IBGE code; maps to the abbreviation; null if invalid (→ `nfce_invalid_key`)
- `NFCE_UF_ROUTES` — embedded table (a copy of `uri_consulta_nfce.json` from sped-nfe): abbreviation → {portalUrlTemplate, family: 'svrs'|'sp'|'mg'|'infosimples'|null}
- `normalizeDescription(desc): string` — uppercase, no accents, strip `\d+(KG|G|L|ML|UN|TP\d+)`, BR abbreviation dictionary (LTE→leite, REFRIG→refrigerante, CERV→cerveja, FGO→frango…)
- `NFCE_FREE_QUOTA=2`, `NFCE_PRO_QUOTA=60`, `nfceQuota(plan)` — cap per plan
- Builds the string for shared i18n/errors

### 2. `apps/api/src/nfce/` (new module — the port)
- `types.ts`: `NfceLookup { lookup(chave, url): Promise<NfceResult> }`; `NfceResult = { emitente:{cnpj,nome}, itens: NfceItem[] }`; `NfceItem = { descricao, quantidade, unidade, valorUnitCents, valorTotalCents, ean?, ncm? }` — **no CPF field** (discarded at the source)
- `parsers/svrs-parser.ts`, `parsers/sp-parser.ts`, `parsers/mg-parser.ts`: each fetches (browser UA, `AbortSignal.timeout`) + parses the portal HTML → `NfceResult`; `<200 lines` each; **CPF never extracted**
- `infosimples-adapter.ts`: POST to the Infosimples API with `INFOSIMPLES_TOKEN` → maps `produtos[]` (codigo/nome/quantidade/valor_unitario/valor_total) → `NfceItem[]`; already structured JSON
- `index.ts`: `lookupFor(uf)` router: family svrs/sp/mg → own parser; infosimples → adapter if `INFOSIMPLES_TOKEN` otherwise `state_unsupported`; null → `uf_unsupported`; `setNfceLookup()` for tests (same shape as `email/index.ts`)
- `matching.ts`: `matchItems(itens, catalog): MatchResult[]` — (1) normalize + fuzzy token-set (`fuzzball`); score ≥ high → matched; (2) ambiguous AND `GEMINI_API_KEY` → cosine (query embedding vs the catalog's cached column); (3) below the minimum → "new"; empty catalog → everything "new"; **never throws for a missing key**
- `embedding.ts`: `embed(texts): Promise<number[][] | null>` — Gemini `gemini-embedding-001` @768d, batch; returns null without `GEMINI_API_KEY` (matching falls back to fuzzy). Cosine in memory

### 3. Schema (migration 0027) — the server stores the receipt, the client stores entities
```ts
nfceImports: { id uuid pk (uuidv7), householdId uuid fk cascade,
  chave text,                 // 44 digits
  uf text, storeCnpj text, storeName text,
  status text enum['pending','parsed','confirmed','failed'],
  itemCount integer, rawJson jsonb,  // parsed items (cache); NO CPF
  createdAt tsz defaultNow, ...syncColumns? (server-authoritative, probably no sync) }
// unique(householdId, chave) → cache + idempotency + serialization of concurrent scans
uniqueIndex('nfce_imports_household_chave_uq').on(householdId, chave)
index for quota counting: (householdId, createdAt) filtering status IN ('parsed','confirmed')

items: + embedding jsonb null   // cached 768d vector (generated on create/rename; reused in matching)
stores: + cnpj text null        // the issuer identifies the store by CNPJ (today stores only have name/city/geo)
priceRecords.source enum: + 'import'   // distinguishes an imported price
```
**The consumer's CPF is NOT persisted, not even in `rawJson`** (LGPD): discarded in the parser/adapter, before any write or log.

### 4. `apps/api/src/routes/nfce.ts` (new) — household-scoped
- `POST /nfce/lookup {chave, url}` — requireHousehold (viewer blocked by the middleware); zValidator; **quota first** (count `nfce_imports` for the month per plan from `c.get('plan')`: Free≥2→403 `nfce_quota_free`, Pro≥60→429 `nfce_quota_pro`) — before touching the portal; **cache** (key exists → returns `rawJson`, does not count toward quota); otherwise `lookupFor(uf)`: `uf_unsupported`→422, `state_unsupported`→501, portal timeout→504 `nfce_portal_error`, adapter error→502 `nfce_provider_error`, empty parse→422 `nfce_parse_failed` (status `failed`, **does not count toward quota**); success → writes `nfce_imports` with status `parsed` + returns items
- `GET /nfce/imports` — lists the month (visible counter if needed) — optional
- Mount in `index.ts:46-53` (`.route('/nfce', nfceRoute)`)

### 5. Client (`apps/web`)
- **QR intercept**: in the ScannerModal caller (compra-page, standalone), if `parseNfceQr(rawValue)` returns a key → opens the import flow; otherwise the current behavior (product). Reuses the scanner, no new lib
- **`lib/nfce-import.ts`**: calls `POST /nfce/lookup`; maps errors to `errors.*`; runs `matchItems` server-side (matching is server; the client only renders `MatchResult[]`)
- **Review screen** (`features/nfce/nfce-review.tsx` + subcomponents <200 lines): lists `MatchResult[]`; per line → matched (swap), new (create inline, name pre-filled), ignore; edit price/qty; **1 store step** (match/create by CNPJ). Reuses the `unknown-barcode-sheet` pattern
- **Confirm**: per non-ignored line → `recordPrice(itemId, storeId, priceCents, brandId, source:'import')` (via repository+outbox); "create" lines → `createItem` + `addBarcode(ean)` before the price. All offline-first
- **UI entry**: "Import receipt (QR)" button in the post-purchase Summary (`compra-page.tsx:528+`) + a standalone entry (new route in `router.tsx` following `compraRoute:135`)
- **Client-side gate**: import is a Pro-taste action; the real gate is the server (quota). The client shows the button to everyone; 403/429 → sheet/message
- i18n: new `nfce.*` + `errors.*` across all **6 locales**

---

## Error Handling Strategy

| Scenario | Handling | User sees |
|---|---|---|
| QR is not NFC-e | `parseNfceQr` null → does not open import | normal product flow; if it came from the import button: `nfce_invalid_qr` |
| 44-digit key but invalid state | 422 `nfce_invalid_key` (or blocked on the client) | "receipt not recognized" |
| State with no parser or adapter | 422 `uf_unsupported` (abbreviation in the response) | "import not yet available in {state}" |
| SE without `INFOSIMPLES_TOKEN` | 501 `state_unsupported` | same + "coming soon" |
| SEFAZ portal timeout/down | 504 `nfce_portal_error` — **does not count toward quota** | "portal unavailable, try again later" |
| Infosimples down / invalid token | 502 `nfce_provider_error` — does not count toward quota | same |
| HTML changed, 0 items | 422 `nfce_parse_failed` — does not count toward quota; log alert | "couldn't read this receipt" |
| Receipt already imported (key exists) | cache, does not count toward quota, does not duplicate | "receipt already imported" + shows items |
| Free exceeded 2/month | 403 `nfce_quota_free` (before the portal) | Pro paywall |
| Pro exceeded 60/month | 429 `nfce_quota_pro` (before the portal) | discreet "monthly limit" message |
| Gemini off/error | matching falls back to fuzzy silently | normal result (perhaps more "new" lines) |
| Empty catalog | everything "new" | review with create-all |

**The handler never leaks CPF**: parsers/adapter discard the field before returning; logs use a partial key/hash, never the raw HTML.

---

## Risks & Concerns

| Concern | Location | Impact | Mitigation |
|---|---|---|---|
| Portal HTML changes (SEFAZ redesigns) | parsers svrs/sp/mg | parser breaks silently, empty items | HTML fixture per portal in the test (detects regression) + graceful `nfce_parse_failed` (never silently empty items); parser isolated per state |
| Infosimples cost (R$100/month floor) | infosimples-adapter | trial account runs out; SE gets expensive | Env-gated (no token = SE off, doesn't break); only SE uses it; the pricing/trial decision stays in the owner's operational checklist |
| Rate limit / IP blocking by volume | portal fetch | mass queries → temporary block | Cache by key (re-scan doesn't query); low volume (import = a one-off action); browser UA; quota limits abuse; short timeout |
| Consumer's CPF in the HTML/JSON | parsers/adapter | LGPD leak | Discard in the parser before returning; `NfceItem`/`NfceResult` with no CPF field; log without raw HTML — verified by test |
| Reais→cents conversion | parsers/adapter | error = price off by 100x | `valorUnitCents = round(valor*100)`; explicit test (e.g. "12,90"→1290) per parser, same as the billing risk |
| `value` decimal with comma (pt-BR) | parsers | wrong parse ("1.234,56") | Normalize separators in the parser; fixture test with real values |
| SP mostly CF-e SAT (model 59) | scope | an SP user scans a SAT receipt and it doesn't work | Out of the MVP and documented; SP here = NFC-e 65; typed error if a SAT one arrives |
| Matching matches wrong | matching.ts | price on the wrong item | Conservative thresholds; ambiguous → "new"/choose (never auto-match on a tie); the review is editable (a human confirms) |
| Free "hackable" (client quota) | gate | bypass 2/month via devtools | Quota is HARD on the server (count `nfce_imports`); the client is only UX |
| Embedding intermittently unavailable | embedding.ts | worse matching | Graceful degradation (fuzzy always resolves the majority); embedding is a tiebreaker, not a critical path |
| Batch write through the outbox | confirm | N POSTs; a new item rejected → FK on the prices | Reuse the FK→409 `ref_missing` mapping (`shopping.ts:235`); create the item before the price in the confirm order |

---

## Tech Decisions (non-obvious)

| Decision | Choice | Rationale |
|---|---|---|
| Lookup route | QR deep-link server-side (A) + paid adapter only for SE | Zero cost in the open states; a deep-link has no captcha (a standalone key does) |
| State routing | Embedded table (a copy of `uri_consulta_nfce.json`) | Don't depend on a remote asset at runtime; state = 2 IBGE digits |
| Matching | Hybrid fuzzy-first; embedding optional env-gated | ~80-90% resolved by tokens; degrades without a key; a repeat purchase is a direct hit |
| Vectors | Cosine in memory, `items.embedding` jsonb column | ≤200 items/household = <1ms; pgvector is overkill |
| Embedding | Gemini `gemini-embedding-001` @768d (MRL) | #1 MTEB multilingual (pt); the free tier covers it; better than OpenAI in pt |
| Quota | Free 2 / Pro 60 per calendar month, HARD on the server | Free taste + an invisible Pro cost ceiling (user request) |
| Cache/idempotency | `nfce_imports` unique(household,chave) | Immutable receipt: a re-scan doesn't query, doesn't duplicate, doesn't count toward quota — 1 table does cache+quota+idempotency |
| Writing | Client via repositories+outbox (offline-first), not a server batch | Project rule: every client write goes through Dexie+outbox |
| Price `source` | New `'import'` in the enum | Distinguishes it from manual/shopping (analytics/audit) |
| CPF | Discarded in the parser/adapter | LGPD; keep only items+CNPJ (public) |
| Price vs item | Price always; new item opt-in per line | The price is the core value; don't pollute the catalog without consent |
| Store | Match by CNPJ (new column in `stores`) | The issuer identifies by CNPJ; the name changes between receipts |
| SE blocked | Infosimples adapter env-gated (not WebView in the MVP) | Turnstile confirmed; WebView is an evolution; the adapter delivers now |

---

## Unresolved questions
1. The exact HTML format of each portal (SVRS/SP/MG) — capture real fixtures during implementation (the parser depends on the current DOM; research confirmed HTTP 200 but not the exact selector).
2. Infosimples item coverage per state for SE — research says "complete" but there's no public SLA; validate during the trial.
3. Whether the review screen should allow 1 store per import or several (a receipt has 1 issuer → 1 store; assumed 1).
4. The exact limits of the Gemini embeddings free tier (third-party sources: ~100 RPM/1k RPD) — plenty of headroom for the volume, but confirm in AI Studio if it scales.
