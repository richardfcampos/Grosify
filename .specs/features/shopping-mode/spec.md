# Feature: Shopping Mode (Phase 4 — MVP launch)

## Context
The heart of the app. It happens at the store, one-handed, in a hurry, offline. Dark screen (at-a-glance legibility, DESIGN.md). Everything offline-first (phase 3 in place).

## Requirements

### Session (MC-1)
- MC-1.1: start a shopping session from a list. Snapshot of the needed quantities:
  - recurring list → `neededQty = max(monthlyQty − onHand, 0)`
  - one-off list → the entry's qty
- MC-1.2: each session item stores `estimatedUnitPriceCents` (cheapest store at that moment) + `estimatedPriceStoreId`.
- MC-1.3: status active → completed/abandoned.

### Shopping (MC-2)
- MC-2.1: **scan-to-check** — scanning a barcode checks the matching item.
- MC-2.2: on checking, record the **actual price** (quick input) + actual quantity → writes a `price_record` (source shopping) and updates the session item (`actualUnitPriceCents`, `actualQty`, `checkedAt`).
- MC-2.3: manual check/uncheck too (an item may not scan).
- MC-2.4: warning if the actual price > the last known price at the store.
- MC-2.5: a "cheaper at [store]" chip (price/date), expandable if there's a store with a lower recorded price.

### Totals (MC-3)
- MC-3.1: fixed header: **running total** (checked items × actual price) vs **estimated** (needed × estimate).
- MC-3.2: green if running ≤ estimated, red if above.
- MC-3.3: recalculates on every recorded price.

### Wrap-up (MC-4)
- MC-4.1: complete the session → summary (receipt): items, total, savings vs estimate.
- MC-4.2: thermal-style receipt (DESIGN.md), a base for sharing (WhatsApp sharing = phase 6 polish).

## Out of scope
- Sharing the receipt on WhatsApp (phase 6).
- A mandatory session store (store is optional; the actual price carries the store chosen on the item).

## Acceptance criteria
- Start a session from a recurring list → items with needed-qty and an estimate.
- Scan/check an item → record the actual price → the running total updates, the stamp appears.
- Actual price above the last → warning. A cheaper recorded store → chip.
- Complete → summary with savings. 100% offline.
- pt-BR + 5 languages.
