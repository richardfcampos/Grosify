# Grocify-parity — feature program

Bring Grosify to parity with the selected items from the Grocify plan.
Ordered by dependency + cost/value. Each phase = one verified commit (typecheck + build + test).

## Locked decisions (user, 2026-06-18)
- Real-time (collaboration) = **SSE poke** (the server notifies, the client pulls). Fits the current sync.
- Charts (analytics) = **Recharts**.
- Categories = **full entity** (name/icon/color/order, system + custom, hide, reorder). Migrates the current text.
- Unknown-code scanner = **OpenFoodFacts with offline fallback**.
- Push notifications: **out of this batch** (the user didn't request item 4). Budget alerts = in-app only.

## Phases

| # | Phase | Schema? | Depends on |
|---|------|---------|---------|
| 1 | Quick wins: offline polish + scanner (QR/torch/vibrate/OFF) + price alert 10%/3m average | no | — |
| 2 | Item: notes, preferred brand, unit conversion | yes (items.notes, item_brands.is_preferred) | — |
| 3 | Lists: icon+color, configurable recurrence, display preferences | yes (lists.icon/color/recurrence/recurrence_day) | — |
| 4 | Categories as an entity (text→table migration) + CRUD/reorder/hide | yes (categories, items.category_id) | — |
| 5 | Shopping mode: stock on completion, hide purchased, group by category, quick-add, swipe | no | 4 (grouping) |
| 6 | Inventory/stock: minimum + low-stock, movement ledger, consumption (manual/scan/batch), adjustment with reason, physical count | yes (items.min_stock, stock_movements) | — |
| 7 | Budget (per list + in-app alert) + Analytics (Recharts) + receipt photo + rating 1-5 | yes (lists.budget_cents, price_records.receipt_key/rating) | 4 (spend/category) |
| 8 | Automatic list generation: draft/active/done status, review screen, exclude sufficient items, auto-gen cron | yes (lists.status, generated_at) | 3 (recurrence) |
| 9 | Collaboration: Admin/Viewer roles + permissions, remove member, activity feed, comments, task assignment, SSE poke | yes (members.role enum, activities, item_comments, session_item.assigned_to) | — |
| 10 | Advanced search/filters (brand/category/recent/autocomplete/filters/sorting/saved) + CSV/PDF export + restore | yes? (saved_filters local) | 4 (category) |

## Conventions (this repo)
- Every domain table: syncColumns (updated_at, deleted_at, server_version) + `assign_server_version` trigger.
- UUIDv7 id generated on the client. Household-scoped routes (household_id from the session).
- Local-first Dexie repository + outbox; the pull adds the table to the engine.
- i18n: 6 locales in sync, always `t('...')`, never a hardcoded string.
- Money in cents; qty numeric(10,3).
- No reference to plan/finding in code/migrations (domain names only).

## Status
All 10 phases completed, verified (typecheck 4 packages + 37 tests + build) and pushed.
Migrations 0012–0017. Commits 7d0c3d5 → 3dc23cb.

## Honest deviations (engineering decision)
- Phase 8: the "auto-generation cron" became a **client-side** calculation (`isRecurrenceDue`) + a "shopping day" badge — offline-friendly, with no notification infrastructure (which was left out of this batch).
- Phase 10: **PDF via `window.print()`** (no lib) and **restore = local merge into Dexie** (safe, device-level; doesn't resend to the server).
- Phase 9: SSE poke is **in-memory** pub/sub (single-instance); multi-instance would require a broker.
- Push notifications (item 4 of the original list) were left out — the user didn't request them; budget alerts are in-app.
