# Natural-language list — Design

**Spec**: `.specs/features/nl-list/spec.md`
**Context**: `.specs/features/nl-list/context.md`
**Status**: Draft (awaiting approval)
**Base**: direct reuse of the NFC-e pipeline (matching + embedding + Gemini REST client) — the file:line references cited below are real code that was read, not research.

---

## Approaches considered (Medium → exploration of the non-obvious decisions)

### How to match the generated line against the catalog (matching reuse)

| | Approach | Trade-off |
|---|---|---|
| **A (recommended)** | **Adapter `GeneratedLine → NfceItem-like`** and call `matchItems` as-is | ✅ zero change to the NFC-e signature (verified: `matchItems(itens, catalog, env)` only uses `item.descricao`); full reuse of fuzzy+embedding+cache. ❌ creating a "fake" `NfceItem` with price 0 (a field unused by matching) |
| B | Refactor `matchItems` to accept `{descricao}[]` (minimal type `MatchableLine`) | ✅ semantically cleaner. ❌ touches tested and stable NFC-e code (regression risk in an already-shipped Pro feature) — violates "a verified decision is sticky" |
| C | Duplicate the matching logic for nl-list | ❌ DRY violated; the 2 pipelines diverge over time |

**Choice: A.** `matchItems` (`matching.ts:142`) only reads `item.descricao` from each `NfceItem` — the adapter builds `{descricao: line.name, quantidade: line.qty, unidade: line.unit, valorUnitCents: 0, valorTotalCents: 0, ean: null}`. Without touching NFC-e. Reuses `loadCatalog`/`embedAndCacheCatalog` (`embed-cache.ts`) identically.

### Review screen (reuse nfce-review vs. duplicate)

| | Approach | Trade-off |
|---|---|---|
| **Generalize (recommended)** | `nfce-line-row` gains props `showPrice`/`showStore` (default true); nl-list passes false | ✅ 1 line component (swapping item, inline create, ignore, editing qty already exist); nl-list reuses the picker. ❌ the component becomes slightly parameterized |
| Lean duplication | dedicated `nl-review.tsx` + `nl-line-row.tsx` | ✅ full isolation. ❌ duplicates the picker + the ignore toggle + the qty edit (≈150 repeated lines that diverge) |

**Choice: generalize the ROW, dedicated container.** `nfce-line-row.tsx` (`:33`) already has everything nl-list needs (generated name, editable qty, swap/create/ignore, `ItemPickerSheet`). Add `showPrice`/`showStore` (bool, default true → NFC-e untouched). The **container** is dedicated (`nl-review.tsx`) because the flow differs: no store step, no `price_records`, target = list (new/existing) via `confirmNlReview`. Do not touch `nfce-review.tsx` (the price/store flow is its own).

### Generation provider (structured output)

| | Approach | Trade-off |
|---|---|---|
| **Gemini generateContent + responseSchema (recommended)** | pure REST fetch following the `embedding.ts` pattern | ✅ same key/env-gate/timeout already proven; native structured output (JSON guaranteed by schema); no SDK. ❌ 1 new network method |
| SDK `@google/genai` | new dependency | ❌ the project does NOT use an SDK (`embedding.ts` is pure fetch by decision) — don't introduce one |
| Prompt "respond in JSON" without responseSchema | more fragile | ❌ the model sometimes wraps in markdown/prose; responseSchema eliminates the fragile parse |

**Choice: pure Gemini REST with `responseMimeType: application/json` + `responseSchema`**, in the same neighboring module as `embedding.ts`. Model `gemini-2.0-flash` (fast/cheap; adjustable). Verified: `generateContent`/`responseSchema` do NOT exist in the repo today (empty `grep`) — it is new code, but follows the exact pattern of `embed`.

---

## Architecture Overview

```mermaid
graph TD
    A[Input a: NewListSheet text field] -->|prompt| SVC[lib/nl-list.ts]
    B[Input b: existing list add button] -->|prompt + listId| SVC
    SVC -->|POST /ai/generate-list {prompt}| RT[routes/ai.ts<br/>requireHousehold + rateLimit 10/min]
    RT --> GATE{plan === pro?}
    GATE -->|free| E403[403 pro_required]
    GATE -->|pro| KEY{GEMINI_API_KEY?}
    KEY -->|no| E501[501 ai_unavailable]
    KEY -->|yes| GEN[nfce/gemini-generate.ts<br/>generateContent + responseSchema<br/>1 retry if JSON invalid]
    GEN -->|failure/timeout| E502[502 ai_generation_failed]
    GEN -->|empty array| EMPTY[200 items:[]<br/>UI warns no items]
    GEN -->|GeneratedLine[]| ADAPT[adapter → NfceItem-like<br/>price 0]
    ADAPT --> MATCH[matchItemsForHousehold<br/>loadCatalog + embedAndCacheCatalog + matchItems]
    MATCH -->|GEMINI_API_KEY?| EMB[(Gemini embed<br/>optional, cache items.embedding)]
    MATCH -->|MatchResult[] + GeneratedLine[]| REV[client: nl-review.tsx<br/>matched/new/ignore, editable qty]
    REV -->|confirm target=new list| CL[createList + setListEntry]
    REV -->|confirm target=existing list| SE[setListEntry on the open list]
    CL --> OUT[outbox → POST /shopping/lists + entries]
    SE --> OUT
```

**Stateless route.** Unlike NFC-e (which persists `nfce_imports` for cache/quota), nl-list **persists nothing server-side**: it generates + matches + responds. Materialization (list/items/entries) is done by the CLIENT via Dexie repositories + outbox — the project pattern (every client write goes through Dexie+outbox; there is no batch endpoint).

**Reusing the core:** `matchItemsForHousehold` is currently a **private** helper in `routes/nfce.ts:165`. Design: extract it to `apps/api/src/nfce/match-for-household.ts` (same logic: `loadCatalog` → `embedAndCacheCatalog` → `matchItems`) and import it in both routes — without duplicating. Alternative (if extracting is risky): export it from `nfce/index.ts`. **Extracting is the way** (a pure function over the catalog, with no route coupling).

---

## Code Reuse Analysis

| Existing | Location | Use |
|---|---|---|
| Env-gated Gemini REST client | `apps/api/src/nfce/embedding.ts:36` (`embed` — fetch, `AbortSignal.timeout`, key-gate) | EXACT pattern for `generateContent`: same base endpoint, same silent-error→null pattern becomes a typed error here |
| Hybrid matching | `apps/api/src/nfce/matching.ts:142` (`matchItems(itens, catalog, env)` → `MatchResult[]`) | Reuse without touching; only reads `item.descricao` (verified) → the adapter builds an `NfceItem` w/ price 0 |
| Catalog load + cache | `apps/api/src/nfce/embed-cache.ts:37,86` (`embedAndCacheCatalog`/`loadCatalog`) | Identical reuse; catalog embedding cached in `items.embedding` (already exists from the NFC-e migration 0027) |
| Per-household pipeline | `apps/api/src/routes/nfce.ts:165` (`matchItemsForHousehold`, private today) | **Extract** to `nfce/match-for-household.ts` and reuse in the 2 routes |
| Safe log | `apps/api/src/nfce/nfce-log.ts:36` (`logNfceLookup` — masks the key) | Pattern for the generation log (`{householdId partial, promptLen, itemCount, status}` — never the raw prompt) |
| Pro gate on the request | `apps/api/src/routes/uploads.ts:29` (`c.get('plan') !== 'pro' → 403 pro_required`) | Copy literally at the start of the route, BEFORE the fetch |
| IP rate limit | `apps/api/src/middleware/rate-limit.ts:11`; used in `routes/households.ts:283` (`rateLimit({windowMs:60_000, max:...})`) | `rateLimit({windowMs:60_000, max:10})` on `.post('/generate-list', ...)` |
| Effective plan | `apps/api/src/middleware/household.ts` (`resolveEffectivePlan`→`c.get('plan')`) | The gate reads `c.get('plan')` |
| Household-scoped route | `apps/api/src/routes/nfce.ts:73` (`.use(requireHousehold)`, mounted in `index.ts`) | Pattern for `routes/ai.ts`; household comes from the session, never from the body |
| Editable review row | `apps/web/src/features/nfce/nfce-line-row.tsx:33` (name+qty+swap/create/ignore+`ItemPickerSheet`) | Generalize w/ `showPrice`/`showStore` (default true → NFC-e untouched); nl-list passes false |
| Typed client error | `apps/web/src/lib/nfce-import.ts:66` (`NfceImportError` → `t('errors.<code>')`) | Pattern for `NlListError` (`ai_unavailable`, `ai_generation_failed`, `prompt_*`, `pro_required`) |
| PaywallSheet + union | `apps/web/src/features/billing/paywall-sheet.tsx:7` (`PaywallFeature`) | `PaywallFeature` gains `'nlList'` + pitch `billing.nlListPaywallPitch` |
| Create standalone list | `apps/web/src/pages/listas-page.tsx:104` (`NewListSheet`), `repositories.ts:396` (`createList`) | Input (a): optional text field in the sheet; confirm calls `createList` + `setListEntry` |
| Existing list + entries | `apps/web/src/pages/lista-detail-page.tsx`, `repositories.ts:453` (`setListEntry` upsert) | Input (b): "add by text" button; confirm calls `setListEntry` on the open list |
| Opt-in item creation | `apps/web/src/db/repositories.ts:46` (`createItem(NewItemInput)`) | "Create" row → `createItem({name, unit, ...})` before the entry |
| Offline confirm (pattern) | `apps/web/src/db/nfce-confirm.ts:28` (`confirmNfceReview` — item before the link) | Pattern for `confirmNlReview` (new item before the entry; no price/store) |
| pglite / fake-idb harness | `apps/api/src/test/*`, `apps/web` vitest.setup | Route integration (Gemini via fetch mock) + client confirm |

---

## Components

### 1. `apps/api/src/nfce/gemini-generate.ts` (new — generation via Gemini REST, env-gated)
- `generateShoppingList(prompt: string, env?): Promise<GeneratedLine[] | null>` — POST to `…/models/gemini-2.0-flash:generateContent?key=…` with `generationConfig: { responseMimeType: 'application/json', responseSchema: {...array of {name, qty, unit}...} }`; `AbortSignal.timeout`; **returns null** when there is no `GEMINI_API_KEY` (the caller turns it into 501) OR when the call/parse fails (the caller decides retry→502). Pattern from `embedding.ts:36`.
- `GeneratedLine = { name: string; qty: number; unit: string }` — output validated by zod before returning (discards lines without `name`).
- Prompt-engineering: short system instruction ("you assemble supermarket shopping lists; return generic items with quantity and unit; respond in the user prompt's language; don't invent brands"). The `responseSchema` guarantees the shape; the zod is the safety net.
- `<200 lines`.

### 2. `apps/api/src/nfce/match-for-household.ts` (new — extraction of the private helper)
- `matchLinesForHousehold(householdId, lines: {descricao: string; quantidade: number; unidade: string; ...}[]): Promise<MatchResult[]>` — moves the logic from `routes/nfce.ts:165` (`loadCatalog` → `embedAndCacheCatalog` → `matchItems`). `routes/nfce.ts` now imports from here (without duplicating).
- `generatedToNfceItem(line: GeneratedLine): NfceItem` — adapter: `{descricao: line.name, quantidade: line.qty, unidade: normalizeUnit(line.unit), valorUnitCents: 0, valorTotalCents: 0, ean: null}`. `normalizeUnit` maps the model's string to the app's `Unit` enum (default `'un'`).

### 3. `apps/api/src/routes/ai.ts` (new) — household-scoped
- `POST /ai/generate-list` — `.use(requireHousehold)` + `rateLimit({windowMs:60_000, max:10})`; zValidator (`prompt` 3–500 chars → 400 `prompt_too_short`/`prompt_too_long`; `listId?` optional uuid, only echoed back to the client, not used server-side); **Pro gate first** (`c.get('plan') !== 'pro' → 403 pro_required`, BEFORE Gemini); **env-gate** (`!GEMINI_API_KEY → 501 ai_unavailable`); calls `generateShoppingList` (1 retry if null due to parse); persistent failure → `502 ai_generation_failed`; empty array → `200 { items: [], lines: [] }`; success → adapts + `matchLinesForHousehold` → `200 { items: GeneratedLine[], lines: MatchResult[] }`; safe log (`{promptLen, itemCount, status}`, never the prompt).
- Mounted in `apps/api/src/index.ts` (`.route('/ai', aiRoute)`, in the same block as the other household-scoped routes).

### 4. Client (`apps/web`)
- **`lib/nl-list.ts`**: `generateNlList(prompt, listId?): Promise<NlGenerateResult>` — POST `/ai/generate-list`; maps typed errors → `NlListError(code)` (`ai_unavailable`, `ai_generation_failed`, `prompt_too_short`, `prompt_too_long`, `pro_required`); returns `{ items: NlGeneratedItem[], lines: NlLine[] }` (mirrors `MatchResult`). `pro_required` handled separately by the caller (paywall).
- **`features/nl-list/nl-review.tsx`** (`<200 lines`): the review container. Receives `{ prompt, target }` where `target = {kind:'new', name} | {kind:'existing', listId}`; runs `generateNlList`; renders rows via `NfceLineRow` (with `showPrice={false} showStore={false}`); warns when `lines.length === 0`; confirm → `confirmNlReview`. Paywall when `pro_required`.
- **`db/nl-confirm.ts`**: `confirmNlReview({target, lines})` — if `target.kind==='new'`: `const listId = await createList({name, isRecurring:false})`; then per non-ignored line: `itemId = line.itemId ?? await createItem({name, unit, ...})` → `setListEntry(listId, itemId, qty)`. If `existing`: same loop on `target.listId`. Order: new item BEFORE the entry (pattern from `nfce-confirm.ts:28`). No price, no store.
- **Input (a)** — `pages/listas-page.tsx` (`NewListSheet:104`): add an optional `<textarea>` "describe in text (optional)"; if filled on submit → open `NlReview` with `target={kind:'new', name}` instead of creating an empty list directly.
- **Input (b)** — `pages/lista-detail-page.tsx`: "Add by text" button → sheet with textarea → `NlReview` with `target={kind:'existing', listId}`.
- **Generalize** `features/nfce/nfce-line-row.tsx`: props `showPrice?: boolean` and `showStore?: boolean` (default true); nl-list passes false (hides the price inputs; the store step belongs to the container, so nl-review simply doesn't render `NfceStoreStep`).
- **Client gate**: buttons visible to all; server `pro_required` → `PaywallSheet feature="nlList"`.
- i18n: new `nlList.*` + `errors.*` in the **6 locales**.

---

## Error Handling Strategy

| Scenario | Handling | User sees |
|---|---|---|
| Free calls the route | `403 pro_required` BEFORE Gemini | `PaywallSheet` (nlList feature) |
| Rate limit exceeded (even Pro) | `429 rate_limited` before Gemini | "too many generations, please wait a moment" (`errors.rate_limited`) |
| `GEMINI_API_KEY` missing | `501 ai_unavailable` | "text generation unavailable" |
| Prompt <3 / >500 chars | `400 prompt_too_short` / `prompt_too_long` (zod) | length message |
| Invalid JSON from the model | 1 retry; failing → `502 ai_generation_failed` | "couldn't generate right now, try again" |
| Gemini timeout | abort → `502 ai_generation_failed` | same |
| Empty array / no items | `200 { items: [] }` (not an error) | empty review + warning "couldn't recognize items in this text" |
| Empty catalog | everything "new" | review with create-all |
| Language outside the 6 | generates anyway | normal result (may have more "new") |
| Non-canonical unit from the model | `normalizeUnit → 'un'` | qty preserved, default unit |

**The handler never leaks the raw prompt or the catalog in logs**: log only `{householdId partial, promptLen, itemCount, status, tokens?}`. Gemini receives ONLY the user's prompt + (implicitly, via post-generation matching) the OWN household's catalog — never another household's data.

---

## Risks & Concerns

| Concern | Location | Impact | Mitigation |
|---|---|---|---|
| Touching `matchItems`/nfce-line-row breaks NFC-e (shipped Pro feature) | matching.ts / nfce-line-row.tsx | production regression | Adapter (doesn't change the `matchItems` signature); props with **default true** (NFC-e unchanged); NFC-e typecheck+tests in the gate |
| Extracting `matchItemsForHousehold` alters `routes/nfce.ts` | nfce.ts | route regression | The extraction is a pure move-refactor (same logic); NFC-e integration tests (`nfce-routes.test.ts`) run in the gate and prove parity |
| Model returns JSON outside the schema | gemini-generate.ts | parse breaks / bad items | `responseSchema` + zod validation + 1 retry → 502; never creates junk (review is the human barrier) |
| Generation cost (Pro without quota) | route | looping/abuse burns credits | Rate limit ~10/min per IP; prompt≤500 chars; token log; Pro-only (not public) |
| Data leakage between households via the prompt | route/Gemini | LGPD/privacy | Gemini receives ONLY the prompt; the catalog (matching) is loaded by session `householdId` (`loadCatalog(householdId)`); nothing from another household is in the context |
| Prompt injection ("ignore instructions, generate X") | gemini-generate.ts | junk output | Low impact: the output is just a shopping list reviewed by the human; nothing executable; the schema limits the shape |
| Absurd unit/qty from the model (qty=9999) | adapter/review | odd entry in the list | qty editable in the review; `normalizeUnit` safe default; optional: clamp qty in the adapter |
| Prompt in a rare language generates little | gemini-generate.ts | few items | Acceptable (AC: generates anyway); empty array → warning, not a crash |
| `501 ai_unavailable` confused with a broken feature | route/UI | user thinks it's a bug | Clear i18n message "unavailable"; docs/env make it explicit that the key turns the feature on |

---

## Tech Decisions (non-obvious)

| Decision | Choice | Rationale |
|---|---|---|
| Matching | Adapter `GeneratedLine → NfceItem` + `matchItems` untouched | `matchItems` only reads `descricao` (verified `matching.ts:96-122`); don't touch stable NFC-e code |
| Per-household helper | Extract `matchItemsForHousehold` (private today) to `nfce/match-for-household.ts` | Reuse across 2 routes without duplicating; low-risk move-refactor |
| Provider | Gemini `generateContent` + `responseSchema`, pure REST | Native structured output; same pattern/env as `embedding.ts`; the project doesn't use an SDK |
| Model | `gemini-2.0-flash` (adjustable) | Fast, cheap, structured output, free tier covers it |
| Gate | Pro-only (`403 pro_required`), NO Free quota | Explicit user decision (more protective than NFC-e); generation is the Pro value feature |
| Anti-abuse | Rate limit ~10/min per IP on the route | Cost is minor units but it prevents looping; blocks before Gemini |
| No key | `501 ai_unavailable` (no fallback) | Generation IS the feature; nothing to degrade (≠ NFC-e matching) |
| Server state | Stateless (does not persist the generation) | The list lives on the client via outbox; no new table; less surface |
| Review | Generalize the ROW (`showPrice/showStore`), dedicated container | Reuses picker/ignore/qty; NFC-e untouched by default; the target flow (list) is its own |
| Confirm | `createList`/`setListEntry` (no price/store) | nl-list assembles a list, doesn't record a price; upsert avoids duplicating an entry |
| Language | Items in the prompt's language; matching normalizes | The model responds in the language; `normalizeDescription` already strips accents/case |
| Retry | 1 retry only on invalid JSON → 502 | Cheap robustness; not an infinite retry (cost) |

---

## Unresolved questions
1. The exact Gemini model (`gemini-2.0-flash` vs. the GA flash current at implementation time) and the `generateContent` free tier limits — confirm in AI Studio; plenty of headroom for the volume (rate limit 10/min).
2. The exact `responseSchema` (`name/qty/unit` fields; include optional `category`/`aisle` for the model to group by?) — MVP stays at `{name, qty, unit}`; enrich later if useful.
3. Qty clamp in the adapter (an upper bound for an absurd qty from the model) — probably yes (e.g. ≤999), but the editable review already covers it; decide at implementation time.
4. Extract `matchItemsForHousehold` into its own module vs. export it from `nfce/index.ts` — extracting recommended (pure function); confirm the `nfce/index.ts` barrel doesn't pull in `db` improperly for the unit tests (a note already exists at `index.ts:17-21`).
5. Logging tokens requires the `usageMetadata` from the `generateContent` response — include it if the endpoint returns it; otherwise only `promptLen`+`itemCount`.
