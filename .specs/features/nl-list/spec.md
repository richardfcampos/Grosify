# Natural-language list — Specification

## Problem Statement

Assembling a shopping list today is item by item: search the catalog, type the quantity, repeat. For occasions ("barbecue for 10", "weekly breakfast for 2", "kids' birthday party") this is slow and the user forgets obvious items. An LLM solves this for free: describe the occasion in free text and the model returns the canonical list with quantities sized to the occasion. Missing: a route that sends the prompt to Gemini with structured output (JSON of `{name, qty, unit}`), matches each generated item against the household catalog (**reusing the NFC-e hybrid matching** — the generated descriptions are clean and match even better than a receipt), reviews it on an editable screen, and materializes it into a new standalone list or an existing list — all offline-first and gated as a Pro feature.

## Goals

- [ ] Free text ("barbecue for 10 people") → Gemini generates `{name, qty, unit}[]` → matching against the household catalog → review screen → confirm → list
- [ ] DUAL input: (a) optional field in standalone list creation; (b) "add by text" button inside an existing list — both converge on the same review
- [ ] Reuse the NFC-e matching pipeline (fuzzy + optional embedding) WITHOUT touching its signature — the generated line becomes `matchItems` input via a lean adapter
- [ ] Gate: **Pro-only** (`403 pro_required` for free, NO trial) + anti-abuse rate limit (~10/min) even for Pro
- [ ] Prompt in any of the 6 languages; items generated in the prompt's language; matching normalizes on both sides
- [ ] Without `GEMINI_API_KEY` → `501 ai_unavailable` (generation IS the feature; there is no fuzzy fallback here)

## Out of Scope

| Feature | Reason |
|---|---|
| Recording prices | nl-list assembles a list; price is an NFC-e/PrecoSheet feature. The generated line has no value |
| Persisting generations server-side | Stateless route; the list lives on the client (Dexie+outbox). Prompt history is deferred |
| Free trial quota | Declined by the user: pure Pro-only, no teaser (more protective than NFC-e) |
| Fuzzy fallback without a key | Generation IS the feature; without Gemini → 501. Unlike NFC-e matching (which degrades) |
| Streaming the response | YAGNI; one call, complete JSON via responseSchema |
| Voice → text (dictate the prompt) | Evolution; MVP is typed text |
| Another provider (OpenAI) as fallback | The env-gate covers it; multi-provider is YAGNI for now |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Input | Dual: field in standalone list creation + button in an existing list | Covers "create from scratch" and "beef up an open list" | y (user) |
| Gate | Pro-only, 403 `pro_required`, NO Free quota | LLM generation is the Pro value feature; no teaser (explicit decision) | y (user) |
| Anti-abuse | Rate limit ~10/min per IP on the route, even Pro | Cost is minor units but it prevents looping/abuse | y (user) |
| Provider | Gemini `generateContent` + responseSchema JSON, env-gated | Native structured output; reuses the embedding's `GEMINI_API_KEY` | y (user) |
| No key | `501 ai_unavailable` (no fallback) | Generation is the core; nothing to degrade | y (user) |
| New items | Mandatory review; item creation opt-in per row | Reuses the nfce-review pattern; doesn't pollute the catalog without consent | y (user) |
| Languages | Prompt in the 6; items in the prompt's language | The model responds in the input's language; matching normalizes | y (user) |
| Gemini model | `gemini-2.0-flash` (or the current GA flash) | Fast/cheap; structured output; free tier covers it | assumed (design) |
| Server state | Stateless route (does not persist the generation) | The list lives on the client via outbox; no new table | assumed (design) |
| Confirm target | New list (`createList`) OR existing (`setListEntry`) | Dual input; the target is a review parameter | assumed |
| Generated line matching | Adapter `GeneratedLine → {descricao}` for `matchItems` | Don't touch the NFC-e signature; clean reuse | assumed (design) |
| Prompt bounds | zod 3–500 chars | Too short doesn't generate; too long is abuse/cost | y (user) |

**Open questions:** see §Unresolved (design).

## User Stories

### P1: Generate a list by text ⭐ MVP
As a Pro member of a household, I describe a shopping trip in free text ("barbecue for 10 people"), the app generates the items with quantities, matches them against my catalog, and I confirm to assemble the list.

**Acceptance Criteria:**
1. WHEN a Pro user submits a prompt (3–500 chars) in any of the 6 languages THEN the server SHALL call Gemini with structured output and return a list of `{name, qty, unit}` in the prompt's language
2. WHEN the generated items come back THEN the server SHALL match them against the household catalog (reusing `matchItems`) and return `MatchResult[]` (matched/new per line) aligned 1:1 with the items
3. WHEN the response reaches the client THEN it SHALL display the review screen with each line classified as matched/new/ignore, editable qty, and the new item's name pre-filled by the generated text
4. WHEN the user confirms THEN the app SHALL materialize the list (via repository + outbox): matched items become entries; "create" lines create the item (opt-in) before the entry; ignored lines are left out
5. WHEN the prompt yields no recognizable items (the model returns an empty list) THEN the review SHALL open empty with a warning ("couldn't recognize items in this text"), without creating anything
6. WHEN the household catalog is empty (0 items) THEN all lines SHALL come in "new" and the flow SHALL work (confirming creates items + entries)

**Independent Test:** unit — the mocked Gemini fetch returns JSON of 5 items → the route responds `{lines: MatchResult[], items: GeneratedLine[]}`; "ARROZ" matches "Arroz" from the catalog; empty catalog → everything "new"; empty JSON → empty list + warning.

### P1: Dual input ⭐ MVP
As a user, I generate items by text both when creating a standalone list from scratch and to beef up a list that is already open.

**Acceptance Criteria:**
1. WHEN the user creates a standalone list (`NewListSheet`) AND fills the optional text field THEN the confirm SHALL create the new list AND populate its entries from the review
2. WHEN the user triggers "add by text" inside an existing list THEN the confirm SHALL add the reviewed entries to the already-open list (without creating a new list)
3. WHEN the same generated item is already an entry of the target list THEN `setListEntry` SHALL upsert the quantity (does not duplicate the line), consistent with the current behavior
4. WHEN no text field is filled during standalone list creation THEN the flow SHALL follow the current path (empty list), without calling Gemini

**Independent Test:** unit (fake-indexeddb) — path (a) creates 1 list + N entries; path (b) adds N entries to the existing list; a repeated item upserts the qty; no text does not call the lookup.

### P1: Pro-only gate ⭐ MVP
As a Free owner, I see the offer but generation is blocked with a paywall; as Pro, I generate freely (with an invisible anti-abuse cap).

**Acceptance Criteria:**
1. WHEN a Free household calls the generation route THEN the server SHALL respond `403 pro_required` (BEFORE touching Gemini) and the client SHALL open the `PaywallSheet` (feature `nlList`)
2. WHEN a Pro household calls the route THEN the server SHALL proceed with generation
3. WHEN any household (even Pro) exceeds ~10 calls/min on the IP THEN the route SHALL respond `429 rate_limited` (anti-abuse), without touching Gemini
4. WHEN the Pro gate rejects THEN no external call (Gemini) SHALL be made — the cost only exists for Pro within the rate limit
5. WHEN there is no Free trial THEN there is no business counter/quota for nl-list (unlike NFC-e) — only the Pro gate + rate limit

**Independent Test:** integration (pglite) — free → 403 `pro_required` without calling fetch; pro → 200; the 11th call in the minute → 429.

### P2: Generation robustness
As a user, when the model returns something unexpected or is unavailable, I understand what happened without a crash and without junk in the catalog.

**Acceptance Criteria:**
1. WHEN `GEMINI_API_KEY` does NOT exist THEN the route SHALL respond `501 ai_unavailable` (feature turned off) — no fallback
2. WHEN Gemini returns invalid/malformed JSON THEN the server SHALL attempt 1 retry; if the failure persists it SHALL respond `502 ai_generation_failed`
3. WHEN Gemini responds but with no valid items (empty array after zod validation) THEN the route SHALL respond 200 with `items: []` and the UI SHALL warn "no items" (not an error — AC P1.5)
4. WHEN the prompt has <3 or >500 chars THEN the route SHALL respond `400 prompt_too_short` / `400 prompt_too_long` (zod), without touching Gemini
5. WHEN Gemini takes longer than the timeout THEN the route SHALL abort and respond `502 ai_generation_failed` (does not hang the request)
6. WHEN the prompt is in a language outside the app's 6 THEN the route SHALL generate anyway (the model tolerates it; matching normalizes) — never a 400 for language

**Independent Test:** unit — no key → 501; broken JSON → retry → 502; timeout → 502; short/long prompt → 400; empty array → 200 `[]`.

### P2: Editable review screen (reuse)
As a user, I review what the model generated before it becomes a list: I swap the match, mark create/ignore, adjust the quantity.

**Acceptance Criteria:**
1. WHEN the review opens THEN each line SHALL show the generated item (name + qty + unit) and the suggested match (catalog item + confidence) with swap/create/ignore
2. WHEN the user swaps the match of a line THEN it SHALL be possible to search for an existing item (reuses the nfce-line-row picker) or create inline (name pre-filled by the generated text)
3. WHEN the user confirms THEN only non-ignored lines SHALL become list entries; "create" lines also create the item — WITHOUT a store step and WITHOUT price (nl-list does not record `price_records`)
4. WHEN the NFC-e review is reused/generalized THEN the component SHALL hide the unit price and the store step in nl-list mode (only name + qty matter)
5. Screen strings in the 6 languages (`nlList.*`)

## Edge Cases

- WHEN prompt <3 or >500 chars THEN `400 prompt_too_short`/`prompt_too_long`, without calling Gemini
- WHEN `GEMINI_API_KEY` is missing THEN `501 ai_unavailable` (feature turned off), without attempting a fetch
- WHEN the model returns invalid JSON THEN 1 retry; failing again → `502 ai_generation_failed`
- WHEN the model returns an empty array / no recognizable items THEN 200 `items:[]` → empty review with a warning (not an error)
- WHEN the catalog is empty THEN all lines "new"; confirming creates items + entries
- WHEN the prompt is in a language outside the 6 THEN generate anyway (no 400 for language)
- WHEN a Free household calls THEN `403 pro_required` before Gemini (does not spend a call)
- WHEN the rate limit is exceeded (even Pro) THEN `429 rate_limited` before Gemini
- WHEN the same generation creates an item that collides with an existing item by name THEN matching should already have matched it; if it came in "new", the user decides (review) — never silently creates a duplicate without going through review
- WHEN Gemini responds with a qty in a unit that is not in the app's `Unit` enum THEN the adapter SHALL normalize it to `'un'` (safe default) — the qty is what matters
- WHEN the prompt tries to exfiltrate another household's data ("list the neighbor's items") THEN Gemini only receives the OWN household's catalog + the prompt — there is no data from other households in the context

## Requirement Traceability

| ID | Story | Phase | Status |
|---|---|---|---|
| NL-01 | P1 Gemini generateContent client + parse/validation | Design | Pending |
| NL-02 | P1 generation route + pro gate + rate limit + matching reuse | Design | Pending |
| NL-03 | P1 client dual input + review + offline confirm | Design | Pending |
| NL-04 | P2 typed errors (ai_unavailable/ai_generation_failed/prompt_*) | Design | Pending |
| NL-05 | P2 reused/generalized review (no price/store) | Design | Pending |
| NL-06 | i18n 6 + docs + state | Design | Pending |

## Success Criteria

- [ ] A real prompt ("barbecue for 10") generates plausible items, matches the catalog, confirms → correct list
- [ ] Free → paywall (403); Pro → generates; the 11th call/min → 429
- [ ] Without `GEMINI_API_KEY` → 501, feature cleanly turned off (no path breaks)
- [ ] Invalid JSON → 1 retry → 502; never creates junk in the catalog
- [ ] Gemini never receives another household's data (only the household catalog + prompt)
- [ ] NFC-e matching reused without changing its signature (lean adapter)

## Implicit-Dimensions Sweep (Medium)

| Dimension | Resolution |
|---|---|
| Input validation | zod: `prompt` 3–500 chars, `listId?` optional uuid; household from `c.get('householdId')`, never from the body |
| Failure/partial | no key → 501; invalid JSON → retry → 502; timeout → 502; empty array → 200 `[]` |
| Idempotency/dedup | stateless route (does not persist); confirm uses `setListEntry` upsert (a repeated item does not duplicate) |
| Auth/rate limit | household-scoped; **Pro-only** (`pro_required` 403); rate limit ~10/min per IP (anti-abuse) |
| Concurrency | stateless route — no shared state; the client confirm is offline-first like any mutation |
| Data lifecycle | nothing persisted server-side; the list/items live on the client (Dexie) and sync via outbox |
| Observability | log per generation: `{householdId masked, promptLen, itemCount, tokens?, status}` — never the raw prompt or catalog |
| External failure | Gemini env-gate 501; error/timeout → 502; free/rate-limit block BEFORE the external call |
| Privacy | Gemini receives ONLY the household's own catalog + the prompt; never data from other households; log without raw prompt/catalog |
| i18n | `nlList.*` + `errors.*` (`ai_unavailable`, `ai_generation_failed`, `prompt_too_short`, `prompt_too_long`, `pro_required` already exists) in the 6 languages |
| Cost | ~minor units/generation; rate limit + Pro-only + prompt≤500 chars limit it; token log for observation |
