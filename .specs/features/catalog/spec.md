# Feature: Catalog (Phase 1)

## Context
The app's foundation: items, stores, and the scanner. Every read/write already goes through a repository over Dexie (local cache), setting up the phase 3 offline sync as a transport swap rather than a rewrite.

## Requirements

### Items (CAT-1)
- CAT-1.1: create an item with a name, category (free text, suggested via datalist), unit (un/kg/g/l/ml), and an optional photo.
- CAT-1.2: an item has **multiple barcodes** (EAN-8/13); add via scanner or manual entry; remove.
- CAT-1.3: edit and delete (soft delete) an item.
- CAT-1.4: list the household's items, search by name, filter by category.
- CAT-1.5: photo resized client-side (WebP ~800px); stored as a local blob in Dexie (R2 upload once sync/credentials exist).
- CAT-1.6: enforce FREE_MAX_ITEMS=30 on the server (rejects the 31st with code `item_limit_reached`).

### Stores (CAT-2)
- CAT-2.1: create a store with a name, city, and neighborhood (lat/lng optional, no map in phase 1).
- CAT-2.2: edit/delete (soft delete), list.

### Scanner (CAT-3)
- CAT-3.1: `useBarcodeScanner` hook — native BarcodeDetector when available, ZXing-wasm polyfill (the `barcode-detector` package) otherwise, via getUserMedia.
- CAT-3.2: fallback always available — type the EAN by hand; the flow never gets stuck.
- CAT-3.3: scanning an already-registered code opens the existing item instead of duplicating it.

### Data / sync-ready (CAT-4)
- CAT-4.1: id generated on the client (UUIDv7).
- CAT-4.2: tables with sync columns (updated_at, deleted_at, server_version via trigger).
- CAT-4.3: repository: generates the id, writes to the API, caches in Dexie; naive pull (everything not deleted) on load. The UI reads from Dexie (reactive).

## Out of scope (later phases)
- Prices, history, shopping lists (phase 2).
- Outbox / push-pull / LWW / real offline (phase 3).
- Photo R2 upload (once credentials exist).

## Acceptance criteria
- Create an item with 2 barcodes via scanner + manual entry, plus a photo; it persists and reappears after reload (Dexie + API).
- Scanning an existing barcode opens the item.
- The 31st item on the free plan is rejected.
- Store CRUD works.
- Everything in pt-BR plus 5 more languages; values and currency respect the household.
