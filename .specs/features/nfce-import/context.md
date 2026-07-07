# Import NFC-e via QR — Context

**Gathered:** 2026-07-05
**Spec:** `.specs/features/nfce-import/spec.md`
**Status:** Ready for design

## Feature Boundary

The consumer scans the QR of a fiscal receipt (NFC-e model 65, the Brazilian electronic consumer receipt), the server queries the SEFAZ portal of the issuing state, parses the items, matches them against the household catalog (fuzzy + embedding), and the user reviews them on an editable screen before confirming → creates `price_records` (always) and new items (opt-in per line). Import is a Pro feature; Free gets a taste of 2/month.

**MVP = QR only.** Receipt photo/OCR is out (deferred). The app scanner already reads `qr_code` (`use-barcode-scanner.ts:5`) — the NFC-e URL passes the current filter.

## Implementation Decisions (locked by the user)

### MVP scope (user chose "QR only")
- Single input: the scanned NFC-e QR. No receipt photo, no OCR, no manual key entry (that route has had a captcha since 2017).
- Photo/OCR moves to Deferred Ideas.

### Plan gate (user chose "Free taste + invisible Pro fair-use")
- **Free: 2 imports/month** (a taste — shows the value, creates a reason to subscribe).
- **Pro: unlimited**, with an **invisible fair-use cap of 60/month** — a cost-safety ceiling, never advertised in the UI. Hitting the Pro cap is a rare edge case; a discreet typed error, not a paywall.
- Counted per calendar month, per household.

### Embeddings (user chose "Gemini, env-gated, degrades")
- `gemini-embedding-001` truncated to 768 dims (MRL). Key via `GEMINI_API_KEY`.
- **Without `GEMINI_API_KEY` → matching falls back to pure fuzzy, never breaks.** Embedding is only a tiebreaker for items that fuzzy couldn't resolve.
- Catalog embeddings (≤200 items/household) are cached in a database column; cosine in memory, NO pgvector.

### Routing per state (user chose "own parsers + paid adapter env-gated + typed error")
- **Own parsers**: SVRS (RS + ~13 partner states), SP, MG — open portals, empirically confirmed today (HTTP 200, no captcha, with a browser UA).
- **Sergipe via Infosimples adapter** (paid API), env-gated `INFOSIMPLES_TOKEN`. Without a token → error `state_unsupported` ("state not yet supported").
- **State with no route** (neither own parser nor adapter) → typed error `uf_unsupported`.
- Per-state routing table: copy `uri_consulta_nfce.json` from sped-nfe **into the code** (not as a dependency). State = first 2 digits of the key (IBGE code).

### Cache/idempotency (user chose "cache by access key")
- A receipt is immutable → **re-scanning the same key does not re-query SEFAZ**. `nfce_imports` stores by `chave` (unique per household), serving as cache + quota counter + idempotency.

### LGPD (user chose "discard CPF, keep items + issuer")
- **The consumer's CPF is discarded** (never persisted or logged).
- Only stored: receipt items + issuer (CNPJ is public data for a legal entity) + access key.
- Strong legal basis: the consumer themselves requests the reading of THEIR OWN receipt; the query is public by design (Ajuste SINIEF).

### UX flow (decisions within the margin)
- **Import button**: in post-purchase (the `Summary` component, `compra-page.tsx:528+`, next to "attach receipt") + a standalone entry point. It fits there because the session already loads store/items/prices to reconcile.
- **Scanner**: reuses `ScannerModal` (already reads QR); detecting a SEFAZ URL in the caller distinguishes a "receipt QR" from a "product barcode".
- **The server queries + parses**; the client shows a **review screen** (matched / new / ignore items, all editable).
- **Confirm** → `price_records` (always) + inventory. **Importing prices is always; creating a new item is opt-in per line** in the review.

### Agent's Discretion
- Exact shape of `nfce_imports` and of the embedding column in the catalog.
- Whether query + parse runs entirely server-side (decided: yes — an env-gated `NfceLookup` port on the server) or partly on the client.
- Fine UX of the review screen (sheet vs full page).
- Exact cosine/fuzzscore threshold for auto-match vs suggestion vs new-item.

### Declined / Undiscussed Gray Areas → Assumptions (logged in the spec)
- WebView on the user's device for states with WAF/captcha (kept as an evolution; the MVP uses the paid adapter for SE).
- CF-e SAT for SP (model 59, most SP supermarkets) — outside the MVP; the MVP is NFC-e model 65.

## Specific References
- Scanner already reads QR: `apps/web/src/features/scanner/use-barcode-scanner.ts:5,16`
- Reference env-gate pattern: `apps/api/src/email/index.ts:20` (factory + noop), `apps/api/src/lib/turnstile.ts:10` (passthrough/fail-closed + timeout)
- Household-scoped route template: `apps/api/src/routes/shopping.ts:211` (POST /prices, zValidator + onConflictDoNothing + FK→409)
- Line-by-line reconciliation reuse: `apps/web/src/features/brands/unknown-barcode-sheet.tsx:24`
- Plan gate on the request: `apps/api/src/middleware/household.ts:52` (`resolveEffectivePlan` → `c.get('plan')`)

## Deferred Ideas
- Receipt photo/OCR (alternative input to QR)
- WebView on the device for states with WAF/Turnstile (works around the captcha without a paid API)
- CF-e SAT model 59 (SP/CE retail)
- More paid adapters per state as demand grows; WebView fallback
- Learn a new item's category via NCM (a free prior from the receipt itself)
