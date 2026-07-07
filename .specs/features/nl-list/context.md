# Natural-language list — Context

**Gathered:** 2026-07-06
**Spec:** `.specs/features/nl-list/spec.md`
**Status:** Ready for design

## Feature Boundary

The user describes a shopping trip in free text ("barbecue for 10 people", "weekly breakfast for 2") in any of the app's 6 languages. The server sends the prompt to Gemini (structured output JSON), receives a list of items+quantities, matches each item against the household catalog **reusing the NFC-e matching pipeline** (fuzzy + optional embedding), and the user reviews it on an editable screen (matched/new/ignore, editable qty — same pattern as `nfce-review`) before confirming. Confirming creates a **new standalone list** OR **adds to an existing list**, via Dexie repositories + outbox (offline-first). Feature is **Pro-only** (no trial).

**Generation IS the feature.** Without `GEMINI_API_KEY` there is no fallback — the route returns `501 ai_unavailable` (unlike NFC-e, where matching degrades to fuzzy; here there is nothing to generate without the model).

## Implementation Decisions (locked by the user)

### DUAL input (user chose both)
- **(a)** **Optional** text field in standalone list creation (`NewListSheet` at `listas-page.tsx:104`): the user types the name + optionally describes it in text → generates items before creating the list.
- **(b)** **"add by text"** button inside an existing list (`lista-detail-page.tsx`): generates items and adds them to the open list.
- Both paths converge on the SAME review screen; only the confirm target changes (new list vs. existing list).

### Gate: PRO-ONLY (user chose — more protective than NFC-e, by explicit decision)
- **Free → `403 pro_required`** directly. **NO trial quota** (NFC-e gives free users 2/month; here it does not). Conscious user decision: LLM generation is the Pro value feature, no teaser.
- **Pro → enabled.** Anti-abuse via **rate limit** (not a business quota): ~10 generations/min per IP on the route (`middleware/rate-limit.ts`), even for Pro — cost per generation is minor units, but it prevents looping/abuse.

### New items: review before creation (user chose)
- Mandatory review screen (reuses the `nfce-review` pattern): each row comes classified as matched/new/ignore; qty editable; a new item is **opt-in per row** (only created if the user confirms). Never creates an item/list without going through review.

### Provider: Gemini env-gated (user chose)
- Generation via **Gemini** (`generateContent` with `responseSchema` JSON — structured output). Env-gated by `GEMINI_API_KEY` (the SAME key as the NFC-e embedding).
- **No key → `501 ai_unavailable`.** HERE there is NO fuzzy fallback: generation is the core of the feature.

### Languages (user chose)
- User prompt in **any of the app's 6 languages** (pt, en, es, it, de, fr).
- Items generated **in the prompt's language** (the model responds in the input language). Matching normalizes (uppercase/no accents) so it matches reasonably cross-language; a new item inherits the generated text.

### Mandatory reuse (real contracts read)
- **Matching:** `apps/api/src/nfce/matching.ts` (`matchItems(itens, catalog, env)` → `MatchResult[]`) + `apps/api/src/nfce/embed-cache.ts` (`loadCatalog`/`embedAndCacheCatalog`). The matching is the SAME. The generated line needs to become an `NfceItem`-like `{descricao, quantidade, unidade, valorUnitCents, valorTotalCents, ean, ncm}` — but WITHOUT price (generation has no values). See design (decision: dedicated type `GeneratedLine {name, qty, unit}` + adapter for `matchItems`, not forcing fake price fields).
- **Gemini client:** `apps/api/src/nfce/embedding.ts` — pure REST (fetch, no SDK), env-gate `GEMINI_API_KEY`, `AbortSignal.timeout`. Text generation adds a new method following the SAME pattern/neighboring module (`generateContent` with `responseMimeType: application/json` + `responseSchema`).
- **Review:** `apps/web/src/features/nfce/{nfce-review,nfce-line-row,nfce-store-step}.tsx` — the design evaluates generalizing vs. a lean duplication (recommendation in the design).
- **Offline confirm:** `apps/web/src/db/repositories.ts` — `createList(NewListInput)`, `setListEntry(listId, itemId, qty)`, `createItem(NewItemInput)`. No price/store (nl-list does not record `price_records`; it only creates/populates the list).
- **Pro gate:** `c.get('plan') !== 'pro' → 403 pro_required` (pattern from `routes/uploads.ts:29`) + `PaywallSheet` (`features/billing/paywall-sheet.tsx`, `PaywallFeature` gains `'nlList'`).
- **Rate limit:** `middleware/rate-limit.ts` (`rateLimit({windowMs, max})`, IP-based, pattern from `households.ts:283`).

### Agent's Discretion
- The exact Gemini model (`gemini-2.0-flash` or the current GA flash) and the shape of the `responseSchema`.
- Whether `matchItems` is called with a `GeneratedLine → NfceItem` adapter (price 0) or whether matching gains an overload/type `MatchableLine {descricao}` — the design decides (recommended: a lean adapter, don't touch the NFC-e signature).
- Generalizing `nfce-review`/`nfce-line-row` (props to hide price/store) vs. duplicating a lean `nl-review`.
- Fine UX of the text field (inline in NewListSheet vs. a dedicated sheet).
- Whether the route persists anything server-side (recommended NOT: stateless, only generates+matches; the list lives on the client via outbox).

### Declined / Undiscussed Gray Areas → Assumptions (logged in the spec)
- Server-side persistence of generations (prompt history/analytics) — out of the MVP; the route is stateless.
- Free trial quota — **explicitly declined** by the user (pure Pro-only).
- Price/store in the review — nl-list does NOT record prices (unlike NFC-e); the review only assembles the list.
- Streaming the Gemini response — YAGNI; one call, complete JSON.

## Specific References
- Reused matching: `apps/api/src/nfce/matching.ts:142` (`matchItems`), `apps/api/src/nfce/embed-cache.ts:37,86` (`embedAndCacheCatalog`/`loadCatalog`)
- Gemini REST client: `apps/api/src/nfce/embedding.ts:36` (`embed` — the env-gated fetch pattern)
- Per-household matching pipeline: `apps/api/src/routes/nfce.ts:165` (`matchItemsForHousehold` — private helper; see design for extracting/reusing)
- Pro gate: `apps/api/src/routes/uploads.ts:29` (`c.get('plan') !== 'pro' → 403 pro_required`)
- Rate limit: `apps/api/src/middleware/rate-limit.ts:11`, used at `apps/api/src/routes/households.ts:283`
- PaywallSheet + feature union: `apps/web/src/features/billing/paywall-sheet.tsx:7` (`PaywallFeature`)
- Review to reuse/generalize: `apps/web/src/features/nfce/nfce-review.tsx:100`, `nfce-line-row.tsx:33`
- Standalone list creation (input a): `apps/web/src/pages/listas-page.tsx:104` (`NewListSheet`), `repositories.ts:396` (`createList`)
- Existing list (input b): `apps/web/src/pages/lista-detail-page.tsx`, `repositories.ts:453` (`setListEntry`)

## Deferred Ideas
- Prompt history / "generate again" (regenerate) — post-MVP
- Persist generations server-side for usage analytics
- Suggest the new item's category/unit via the prompt (model bonus)
- Voice → text (dictate the prompt) — future
- Fallback to another provider (OpenAI) when Gemini is down — YAGNI (env-gate covers it)
