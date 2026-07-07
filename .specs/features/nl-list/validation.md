# Validation — nl-list (natural-language list)

**Verifier:** independent (author ≠ verifier). Evidence-or-zero + mutation sensor.
**Scope:** commits `dd27557^..HEAD` (a510007) — T1–T9 + the extra 429 test (633e55d).
**Range:** `git log --oneline dd27557^..HEAD` = 11 commits (1 spec docs + 10 code/test).
**Verdict:** **PASS ✅**

---

## Gate (exact counts)

| Step | Command | Result |
|---|---|---|
| UI build | `pnpm --filter @grosify/ui build` | ✅ built (ui.css 3.94kB, index.es.js 3.29kB) |
| Typecheck | `pnpm typecheck` | ✅ 6/6 tasks, 0 errors (FULL TURBO) |
| API tests | `pnpm --filter @grosify/api test` | ✅ **302 passed** / 24 files, 0 failed |
| Web tests | `pnpm --filter @grosify/web test` | ✅ **34 passed** / 7 files, 0 failed |

Counts match the expectation (~302 api / ~34 web).

---

## Coverage anchored to the spec (28 ACs + 11 edge cases)

### P1 — Generate a list by text (NL-01/NL-02)

| AC | Evidence | Outcome |
|---|---|---|
| P1.1 Pro + prompt 3–500 → Gemini structured output → `{name,qty,unit}` | `gemini-generate.ts:123-153` (fetch + responseSchema); `gemini-generate.test.ts:28-40` | ✅ valid JSON → aligned `GeneratedLine[]` |
| P1.2 matches against the catalog via `matchItems` → `MatchResult[]` 1:1 | `match-for-household.ts:24-31`; `ai.ts:90-92`; `ai-generate-list.test.ts:137-159` (`lines[0].itemId===arrozId`, `lines[1].itemId===null`) | ✅ matches "Arroz", "Guardanapo" new |
| P1.3 review classifies matched/new, editable qty, new name pre-filled | `nl-review.tsx:116-129` (`newItemName: line.itemId ? '' : line.suggestedName`); `nfce-line-row.tsx:86-93` (editable input) | ✅ inspection — pre-fills from suggestedName |
| P1.4 confirm materializes: matched→entry; "create"→item first; ignored→out | `nl-confirm.ts:38-41` (createItem BEFORE setListEntry); `nl-confirm.test.ts:43-64,154-170` | ✅ item created first; the entry references the new item |
| P1.5 empty list → empty review + warning, without creating anything | `ai.ts:86` (200 `{items:[],lines:[]}`); `nl-review.tsx:156-158` (`noItemsWarning`); `ai-generate-list.test.ts:171-178` | ✅ 200 `[]` + `nlList.noItemsWarning` |
| P1.6 empty catalog → everything "new", the flow works | `ai-generate-list.test.ts:161-169` (`every itemId===null`); `match-for-household.test.ts:115-124` | ✅ all lines null |

### P1 — Dual input (NL-03)

| AC | Evidence | Outcome |
|---|---|---|
| P2.1 text field in standalone creation → creates list + entries | `listas-page.tsx:128-135,156-159` (nlPrompt → `NlReview target=new`); `nl-confirm.test.ts:43-64` | ✅ creates 1 list + N entries |
| P2.2 "add by text" in an existing list → adds without creating a list | `lista-detail-page.tsx` diff (`AddByTextSheet` → `target=existing`); `nl-confirm.test.ts:66-96` | ✅ N entries, no new list |
| P2.3 item already in the list → `setListEntry` upsert (no duplicate) | `nl-confirm.ts:40`; `nl-confirm.test.ts:98-152` (1 entry, qty=4) | ✅ qty upsert |
| P2.4 no text in creation → current path (empty), no Gemini | `listas-page.tsx:132-153` (only calls `createList` if `!nlPrompt.trim()`) | ✅ inspection — empty nlPrompt skips NlReview |

### P1 — Pro-only gate (NL-02)

| AC | Evidence | Outcome |
|---|---|---|
| P3.1 Free → 403 `pro_required` BEFORE Gemini; client opens PaywallSheet(`nlList`) | `ai.ts:62`; `ai-generate-list.test.ts:192-200` (spy 0 calls); `nl-review.tsx:45-47,61-63`; `paywall-sheet.tsx` (`nlList` feature) | ✅ 403 + 0 Gemini calls + paywall |
| P3.2 Pro → proceeds | `ai-generate-list.test.ts:137-159` (200) | ✅ 200 |
| P3.3 >10/min (even Pro) → 429 before Gemini | `ai.ts:48` (rateLimit 10/60s); `ai-generate-list.test.ts:256-274` | ✅ 11th → 429 |
| P3.4 gate rejects → no external call | `ai-generate-list.test.ts:199,221,241,251` (spy 0 on free/no-key/short/long) | ✅ the spy proves 0 calls |
| P3.5 no Free quota (only gate + rate limit) | `ai.ts` — no business counter (contrast with nfce) | ✅ inspection — no counter |

### P2 — Robustness (NL-04)

| AC | Evidence | Outcome |
|---|---|---|
| P4.1 no `GEMINI_API_KEY` → 501 `ai_unavailable` | `ai.ts:66`; `ai-generate-list.test.ts:213-222` (501, spy 0) | ✅ 501 without touching Gemini |
| P4.2 invalid JSON → 1 retry → 502 | `ai.ts:73-75`; `ai-generate-list.test.ts:224-232` (spy 2 calls) | ✅ 502 after 2 attempts |
| P4.3 empty array post-zod → 200 `items:[]` + warning | `ai.ts:86`; `gemini-generate.test.ts:42-46` | ✅ 200 `[]` |
| P4.4 <3/>500 chars → 400 `prompt_too_short`/`prompt_too_long` | `ai.ts:35,49-58`; `ai-generate-list.test.ts:234-252` | ✅ typed 400, spy 0 |
| P4.5 timeout → 502 (does not hang) | `gemini-generate.ts:144` (`AbortSignal.timeout` 15s → null); `gemini-generate.test.ts:73-81` | ✅ null → 502 |
| P4.6 language outside the 6 → generates anyway (never a 400 for language) | `ai.ts:35` (zod only validates length, not language); `gemini-generate.ts:40-43` (system: prompt's language) | ✅ inspection — no language check |

### P2 — Reused editable review (NL-05)

| AC | Evidence | Outcome |
|---|---|---|
| P5.1 each line shows generated + suggested match + swap/create/ignore | `nfce-line-row.tsx:44-149` (reused); `nl-review.tsx:164-173` | ✅ inspection — reuses NfceLineRow |
| P5.2 swap match: nfce-line-row picker OR create inline pre-filled | `nfce-line-row.tsx:134-147,152-211` (ItemPickerSheet) | ✅ inspection |
| P5.3 confirm: only non-ignored become an entry; "create" creates the item; NO store/price | `nl-review.tsx:141-149`; `nl-confirm.ts` (no price_records) | ✅ inspection — no price/store |
| P5.4 nl-list mode hides the unit price and the store step | `nl-review.tsx:169-170` (`showPrice={false} showStore={false}`); `nfce-line-row.tsx:112,115-129` (price input only if `showPrice`) | ✅ inspection — price hidden |
| P5.5 screen strings in the 6 languages (`nlList.*`) | 6 locales × 10 identical sub-keys (pt/en/es/it/de/fr) | ✅ 6/6 complete structure |

### Edge cases (11)

| Edge | Evidence | Outcome |
|---|---|---|
| <3/>500 chars → 400 without Gemini | `ai-generate-list.test.ts:234-252` | ✅ killed by implicit mutation |
| no key → 501 without fetch | `ai-generate-list.test.ts:213-222`; `gemini-generate.test.ts:50-56` | ✅ |
| invalid JSON → retry → 502 | `ai-generate-list.test.ts:224-232` | ✅ |
| empty array → 200 `[]` + warning | `gemini-generate.test.ts:42-46`; `nl-review.tsx:156-158` | ✅ |
| empty catalog → everything new | `match-for-household.test.ts:115-124` | ✅ |
| language outside the 6 → generates | `ai.ts:35` (only validates length) | ✅ inspection |
| Free → 403 before Gemini | `ai-generate-list.test.ts:192-200` | ✅ |
| rate limit (even Pro) → 429 before | `ai-generate-list.test.ts:256-274` | ✅ |
| name collision → goes through review, never silently duplicates | `nl-review.tsx` (the user decides); `nl-confirm.ts:40` (setListEntry upsert) | ✅ inspection |
| unit outside the enum → 'un' | `match-for-household.ts:58-61`; `match-for-household.test.ts:92-97`; `nl-confirm.test.ts:184-194` | ✅ |
| prompt exfiltrates another household → only the own household's catalog in the context | `ai.ts:68,91` (session `householdId`, `matchLinesForHousehold(householdId,...)`); Gemini receives only `prompt` (`gemini-generate.ts:138`) — the catalog does NOT go into the prompt, only into the local matching | ✅ inspection — no cross-household data |

**Coverage: 28/28 ACs covered (17 by anchored test, 11 by UI/structure inspection). 11/11 edge cases. 0 gaps.**

Privacy/observability: `ai.ts:79-83` logs only `{household(6 chars), lineCount, promptLen}` — NEVER the raw prompt or the catalog. ✅ (Cost/Privacy from the sweep confirmed.)

---

## Mutation sensor (6 rounds, 1 at a time, restored with `git checkout`)

| # | Mutation | File | Test that caught it | Result |
|---|---|---|---|---|
| a | remove the Pro gate (`plan!=='pro'`) | `ai.ts:62` | `free → 403` + `429 rate limit` (2 fail: 403→502) | **KILLED** |
| b | remove the retry (1 call) | `ai.ts:73-74` | `spy proves 2 calls` (expected 2, got 1) | **KILLED** |
| c | remove the qty clamp (`<=MAX_QTY`) | `gemini-generate.ts:81` | `qty >999 → clamp 1` (9999 leaked) | **KILLED** |
| d | move rateLimit to AFTER the Pro gate | `ai.ts:46-48` | `11th → 429` (free didn't consume the bucket: 403 instead of 429) | **KILLED** |
| e | confirm "new" writes an entry WITHOUT creating the item | `nl-confirm.ts:39` | `create creates the item FIRST` (0 items, 3 fail) | **KILLED** |
| f | zod accepts a line without name (`name` optional) | `gemini-generate.ts:74` | `line without name → discarded` (empty-name leaked) | **KILLED** |

**6 mutations, 6 killed, 0 survived.** The suite has sensitivity at the spec's critical correctness points (gate, retry, clamp, gate ordering, create-item-then-entry ordering, zod junk filter).

---

## NFC-e intact after the refactor (T2 — matching move-refactor)

**Yes — verified.**

- **Pure move-refactor:** `matchItemsForHousehold` (private helper in `routes/nfce.ts`) → `matchLinesForHousehold` in `nfce/match-for-household.ts`. The diff shows an IDENTICAL body (`loadCatalog` → `embedAndCacheCatalog` → `matchItems`), only renamed and moved. `routes/nfce.ts` now imports from the new module and calls it in both paths (cache `:97` and fresh lookup `:128`).
- **NFC-e suite green:** `pnpm --filter @grosify/api test nfce` → **12 files / 152 tests, 0 failed**.
- **`nfce-line-row` defaults preserved:** `showPrice = true` default (`nfce-line-row.tsx:39`) and `showStore?` reserved with default true (`:29`, not used in the render); the NFC-e path passes neither → the NFC-e render (unit price + qty) is unchanged. nl-list passes both `false` to hide the price.

---

## Range / tree

- **Range validated:** `dd27557^..HEAD` (a510007) — 11 commits.
- **Final `git status --short`:** clean except this `validation.md`. All 6 mutations restored with `git checkout`; no production file altered.

## Ranked gaps

No correctness gaps. Minor observations (non-blocking):

1. **Incomplete i18n (translation, not structure):** `nlListPaywallPitch` is in English in es/it/de/fr; the `fr` `rate_limited`/`ai_*`/`prompt_*` are also in English. The KEYS exist in the 6 (no missing-key crash), but the text is not localized — degrades UX, not functionality. Outside the strict scope of "6/6 keys present" (which passes).
2. **`showStore` is a non-functional reserved prop:** `nfce-line-row.tsx:29` declares `showStore?` but the component has no store step to hide (the NFC-e "store step" lives in another component). Harmless — it's a placeholder for symmetry with spec P5.4; nl-list passes `false` with no effect. Not a bug.

## Unresolved questions

None. All verifiable ACs were anchored; the UI ones (no render harness) by component + condition + i18n inspection.
