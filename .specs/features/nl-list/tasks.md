# Natural-language list — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: activate it by name and follow its Execute flow and Critical Rules (per-task cycle implement→gate→atomic commit, adequacy review, Verifier at the end). If the skill cannot be activated, STOP.

**Design**: `.specs/features/nl-list/design.md`
**Status**: Ready for execution
**Orchestration**: 1 worker per phase (sequential, same worktree, current branch). Workers commit per task; they do NOT push/merge. Models per phase (justification below): P1 opus · P2 opus · P3 sonnet · P4 haiku · Verifier opus.

**Model justification**: P1 (Gemini `generateContent` client + prompt engineering + zod parse/validation — new network code, structured JSON, retry) = **opus**. P2 (route + Pro gate + rate limit + extraction/reuse of matching + pglite integration — the cost gate and the regression-free NFC-e reuse are the core) = **opus**. P3 (client: dual input + generalized review + offline confirm — a known pattern, UI without a render harness) = sonnet. P4 (i18n 6 + STATE.md + env + tracker, mechanical) = haiku.

---

## Test Coverage Matrix

> Guidelines: global CLAUDE.md (run lint/tests; no mocks to pass the build) + existing harness (pglite api, fake-indexeddb web). No threshold configured — strong defaults. Tests derive from the ACs.

| Code Layer | Test Type | Coverage Expectation | Location | Run Command |
|---|---|---|---|---|
| gemini-generate (generateContent) | unit (mocked fetch) | valid JSON→GeneratedLine[]; no key→null; invalid JSON→null (retry in the caller); timeout→null; empty array→[] | `apps/api/src/nfce/gemini-generate.test.ts` | `pnpm --filter @grosify/api test` |
| adapter + match-for-household | unit | GeneratedLine→NfceItem (price 0, normalized unit); matchLinesForHousehold matches/new; empty catalog→everything new | `apps/api/src/nfce/match-for-household.test.ts` | same |
| /ai/generate-list route + gate + rate limit | integration (pglite, fetch mock) | free→403 pro_required; pro→200; 11th/min→429; no key→501; invalid JSON→retry→502; empty array→200 []; short/long prompt→400 | `apps/api/src/test/ai-generate-list.test.ts` | same |
| client offline confirm | unit (fake-indexeddb) | target new→1 list + N entries; target existing→N entries in the list; repeated item upsert; "create" line creates the item before the entry; ignored does not write | `apps/web/src/db/nl-confirm.test.ts` | `pnpm --filter @grosify/web test` |
| client generation service | unit (fetch mock) | typed error→translatable code; pro_required handled separately | `apps/web/src/lib/nl-list.test.ts` | same |
| UI review/entries | none (no render harness) | typecheck + build gate | — | build gate |
| generalized nfce-line-row (showPrice/showStore) | none (typecheck guarantees the default) | build gate — NFC-e does not change | — | build gate |
| i18n/docs/env | none | build gate (typecheck catches a missing key) | — | build gate |

## Parallelism Assessment

| Test Type | Parallel-Safe? | Isolation | Evidence |
|---|---|---|---|
| api integration | per file yes (module-level PGlite), intra-file no (TRUNCATE beforeEach) | 1 PGlite per file | `db-integration.test.ts` |
| api/web unit | yes | fetch/idb mocked per file | vitest setup |

Sequential execution per phase (same worktree) — `[P]` is only free-ordering within the phase.

## Gate Check Commands

> **Lesson from the 8th feature's CI**: include the MONOREPO `pnpm typecheck` in the Build gate — per-filter typecheck doesn't catch a cross-package break (shared↔api↔web). The Build gate runs the aggregated monorepo typecheck in addition to the per-package ones.

| Gate | When | Command |
|---|---|---|
| Quick-api | api-only task | `pnpm --filter @grosify/api typecheck && pnpm --filter @grosify/api test` |
| Quick-web | web-only task | `pnpm --filter @grosify/web typecheck && pnpm --filter @grosify/web test` |
| Build | end of phase / task without tests | `pnpm typecheck && pnpm --filter @grosify/ui build && pnpm --filter @grosify/api test && pnpm --filter @grosify/web test` |

---

## Execution Plan

```
P1 (opus):   T1 → T2                 Gemini generateContent client + adapter/extraction of matching
P2 (opus):   T3 → T4                 /ai/generate-list route (Pro gate + rate limit + errors) + integration
P3 (sonnet): T5 → T6 [P] → T7        client: dual input + generalized review + offline confirm
P4 (haiku):  T8 → T9                 i18n 6 languages + STATE.md/env/tracker
Verifier (opus): post-T9, automatic
```

---

## Task Breakdown

### T1: Gemini client — generateContent + parse/validation
**What**: `apps/api/src/nfce/gemini-generate.ts`: `generateShoppingList(prompt, env?)` — POST to `…/models/gemini-2.0-flash:generateContent?key=…` with `generationConfig.responseMimeType='application/json'` + `responseSchema` (array of `{name, qty, unit}`); short system instruction (assembles a shopping list, generic items w/ qty+unit, responds in the prompt's language, no brands); `AbortSignal.timeout`; returns **null** without `GEMINI_API_KEY` (→ caller 501) or on failure/invalid JSON (→ caller retry/502); validates the output with **zod** (discards lines without `name`). EXACT pattern from `embedding.ts:36`. Type `GeneratedLine = {name, qty, unit}`.
**Where**: `apps/api/src/nfce/gemini-generate.ts` + `apps/api/src/nfce/gemini-generate.test.ts`
**Depends**: none · **Requirement**: NL-01 · **Tests**: unit (fetch mock: valid JSON→lines; no key→null; broken JSON→null; timeout→null; empty array→[]) · **Gate**: Quick-api
**Done when**: parse validates the schema; no key returns null; failure returns null (without throwing); zod discards an invalid line.
**Commit**: `feat(nl-list): cliente Gemini generateContent com structured output`

### T2: Adapter + extraction of the per-household matching
**What**: (a) extract `matchItemsForHousehold` from `routes/nfce.ts:165` to `apps/api/src/nfce/match-for-household.ts` (`matchLinesForHousehold(householdId, items)`: `loadCatalog`→`embedAndCacheCatalog`→`matchItems`); `routes/nfce.ts` now imports from here (pure move-refactor — no behavior change). (b) `generatedToNfceItem(line)`: `{descricao:line.name, quantidade:line.qty, unidade:normalizeUnit(line.unit), valorUnitCents:0, valorTotalCents:0, ean:null}`; `normalizeUnit` maps the model's string to the `Unit` enum (default `'un'`). **DO NOT touch the `matchItems` signature.**
**Where**: `apps/api/src/nfce/match-for-household.ts` (new), `apps/api/src/routes/nfce.ts` (import), `apps/api/src/nfce/match-for-household.test.ts`
**Depends**: T1 · **Requirement**: NL-01/NL-02 · **Tests**: unit (the adapter builds an NfceItem w/ price 0 and normalized unit; matchLinesForHousehold matches/new; empty catalog→everything new) · **Gate**: Quick-api (also runs the NFC-e route tests — they prove the extraction's parity)
**Done when**: NFC-e stays green after the extraction; the adapter is deterministic; `matchItems` untouched.
**Commit**: `feat(nl-list): adaptador de linha gerada e matching por casa reusável`

### T3: /ai/generate-list route — Pro gate + rate limit + errors
**What**: `apps/api/src/routes/ai.ts`: `POST /generate-list` (`.use(requireHousehold)` + `rateLimit({windowMs:60_000, max:10})`); zValidator (`prompt` 3–500 chars → 400 `prompt_too_short`/`prompt_too_long`; `listId?` optional uuid, only echoed); **order**: Pro gate (`c.get('plan') !== 'pro' → 403 pro_required`) → env-gate (`!GEMINI_API_KEY → 501 ai_unavailable`) → `generateShoppingList` (1 retry if null due to parse; persistent failure → 502 `ai_generation_failed`) → empty array → 200 `{items:[], lines:[]}` → success → adapts + `matchLinesForHousehold` → 200 `{items, lines}`; safe log (`{promptLen, itemCount, status}`, never the prompt). Mounted in `apps/api/src/index.ts` (`.route('/ai', aiRoute)`).
**Where**: `apps/api/src/routes/ai.ts` · `apps/api/src/index.ts` · `apps/api/src/test/ai-generate-list.test.ts`
**Depends**: T2 · **Requirement**: NL-02/NL-04 · **Tests**: integration (mocked Gemini fetch): free→403 before the fetch; pro happy→200 lines; no key→501; invalid JSON→retry→502; timeout→502; empty array→200 []; short/long prompt→400; 11th call/min→429
**Gate**: Build (end of phase — includes the monorepo `pnpm typecheck`) · **Commit**: `feat(nl-list): rota de geração com gate Pro, rate limit e erros tipados`

### T4: Client — generation service + typed errors
**What**: `apps/web/src/lib/nl-list.ts`: `generateNlList(prompt, listId?)` → POST `/ai/generate-list`; `NlListError(code)` (`ai_unavailable`, `ai_generation_failed`, `prompt_too_short`, `prompt_too_long`, `pro_required`) — `code` = `t('errors.<code>')` key; `pro_required` signaled to the caller to open the paywall; returns `{items: NlGeneratedItem[], lines: NlLine[]}` (mirrors `MatchResult`). Pattern from `lib/nfce-import.ts:66`.
**Where**: `apps/web/src/lib/nl-list.ts` + `apps/web/src/lib/nl-list.test.ts`
**Depends**: T3 · **Requirement**: NL-02/NL-04 · **Tests**: unit (fetch mock: error→translatable code; pro_required separately; happy→items+lines) · **Gate**: Quick-web
**Commit**: `feat(web): serviço client de geração de lista por texto`

### T5: Client — generalized review (no price/store) [P]
**What**: (a) generalize `apps/web/src/features/nfce/nfce-line-row.tsx`: props `showPrice?: boolean`, `showStore?: boolean` (**default true** → NFC-e untouched); with false, hides the price inputs. (b) `apps/web/src/features/nl-list/nl-review.tsx` (`<200 lines`): container — receives `{prompt, target}` (`target = {kind:'new', name} | {kind:'existing', listId}`); runs `generateNlList`; renders rows via `NfceLineRow` (`showPrice={false} showStore={false}`); warns when `lines.length===0`; `pro_required`→`PaywallSheet feature="nlList"`; confirm→`confirmNlReview`. DO NOT touch `nfce-review.tsx`.
**Where**: `apps/web/src/features/nfce/nfce-line-row.tsx` (props), `apps/web/src/features/nl-list/nl-review.tsx` (new)
**Depends**: T4 · **Requirement**: NL-05 · **Tests**: none (UI; typecheck guarantees the default doesn't change NFC-e) · **Gate**: Quick-web (typecheck)
**Commit**: `feat(web): tela de revisão de lista gerada (reusa linha do NFC-e)`

### T6: Client — offline confirm (new / existing list) [P]
**What**: `apps/web/src/db/nl-confirm.ts`: `confirmNlReview({target, lines})` — `target.kind==='new'` → `listId = await createList({name, isRecurring:false})`; otherwise `listId = target.listId`; per non-ignored line: `itemId = line.itemId ?? await createItem({name:line.newItemName||line.raw.name, unit, photoBlob:null, barcodes:[]})` (item BEFORE the entry) → `setListEntry(listId, itemId, line.qty)`. NO price, NO store. Pattern from `nfce-confirm.ts:28`.
**Where**: `apps/web/src/db/nl-confirm.ts` + `apps/web/src/db/nl-confirm.test.ts`
**Depends**: T4 · **Requirement**: NL-03 · **Tests**: unit (fake-indexeddb): new→1 list+N entries; existing→N entries in the target list; repeated item→qty upsert; "create" line→item before the entry; ignored does not write
**Gate**: Quick-web · **Commit**: `feat(web): confirmação da lista gerada cria/preenche lista offline`

### T7: Client — dual input (creation + existing list)
**What**: (a) `apps/web/src/pages/listas-page.tsx` (`NewListSheet:104`): optional `<textarea>` "describe in text"; if filled on submit → open `NlReview target={kind:'new', name}` instead of creating an empty list; if empty → current path. (b) `apps/web/src/pages/lista-detail-page.tsx`: "Add by text" button → sheet w/ textarea → `NlReview target={kind:'existing', listId}`.
**Where**: `apps/web/src/pages/listas-page.tsx`, `apps/web/src/pages/lista-detail-page.tsx`
**Depends**: T5, T6 · **Requirement**: NL-03 · **Tests**: none (UI) · **Gate**: Build (end of phase — includes the monorepo `pnpm typecheck`)
**Commit**: `feat(web): entrada por texto na criação de lista e em lista existente`

### T8: i18n — 6 locales
**What**: `nlList.*` keys (text field button/label, review title, "no items" warning, confirm, placeholder) and new `errors.*` (`ai_unavailable`, `ai_generation_failed`, `prompt_too_short`, `prompt_too_long`; `pro_required` and `rate_limited` already exist — reuse) + `billing.nlListPaywallPitch` in pt (source) + en/es/it/de/fr (English placeholder in the 5, final translation here) — identical structure across the 6. `PaywallFeature` already gained `'nlList'` in T5.
**Where**: `apps/web/src/i18n/locales/{pt,en,es,it,de,fr}.ts`
**Depends**: T4-T7 · **Requirement**: NL-06 · **Tests**: none · **Gate**: Quick-web (typecheck catches a missing key)
**Commit**: `feat(i18n): strings de lista por texto nos 6 idiomas`

### T9: Docs + env + STATE.md + tracker
**What**: (a) `apps/api/.env.example`: a note on `GEMINI_API_KEY` that the SAME key turns on the NFC-e embedding **and** the natural-language list generation (without it: fuzzy matching in NFC-e / nl-list returns 501); (b) `docs/operational-setup-checklist.md`: add 1 line to the Gemini entry ("also turns on natural-language list generation — Pro-only"); (c) `.specs/project/STATE.md`: a 2026-07-06 decision line (feature nl-list: Pro-only with no trial, Gemini generateContent env-gated, rate limit 10/min, NFC-e matching reuse without touching the signature); (d) mark tasks done in this file.
**Where**: `apps/api/.env.example`, `docs/operational-setup-checklist.md`, `.specs/project/STATE.md`, this file
**Depends**: T1-T8 · **Requirement**: NL-06 · **Tests**: none · **Gate**: final Build (includes the monorepo `pnpm typecheck`)
**Commit**: `feat(nl-list): env de exemplo, checklist e registro de estado`

---

## Diagram-Definition Cross-Check

| Task | Depends (body) | Diagram | Status |
|---|---|---|---|
| T1 | none | P1 start | ✅ |
| T2 | T1 | P1 | ✅ |
| T3 | T2 | P2 after P1 | ✅ |
| T4 | T3 | P2 end | ✅ |
| T5 | T4 | P3 [P] | ✅ |
| T6 | T4 | P3 [P] | ✅ |
| T7 | T5,T6 | P3 end | ✅ |
| T8 | T4-T7 | P4 | ✅ |
| T9 | T1-T8 | P4 last | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix requires | Task says | Status |
|---|---|---|---|---|
| T1 | gemini client | unit (fetch mock) | unit | ✅ |
| T2 | adapter/match | unit | unit | ✅ |
| T3 | route/gate/rate | integration | integration | ✅ |
| T4 | client service | unit | unit | ✅ |
| T5 | UI review | none/typecheck | none | ✅ |
| T6 | offline confirm | unit | unit | ✅ |
| T7 | UI entries | none | none | ✅ |
| T8/T9 | i18n/docs/env | none | none | ✅ |

## Task status

- [x] T1 (9b4f522) · [x] T2 (b34816a) · [x] T3 (f43de43) · [x] T4 (9adf3de) · [x] T5 (c92c58d) · [x] T6 (9adf3de) · [x] T7 (67af972) · [x] T8 (9deea8e) · [ ] T9

**Status**: Done (awaiting Verifier)
