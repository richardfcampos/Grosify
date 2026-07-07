# Feature: Prices + Lists (Phase 2)

## Context
The app becomes useful: it organizes shopping into lists, knows how much things cost and where they're cheapest. The domain logic (`cheapestStore`, `priceChange`, `neededQty`, `estimateTotal`) is already tested in shared. Prices in the household's currency (minor units).

## Requirements

### Multiple lists (LS-1)
- LS-1.1: create several named lists ("Monthly groceries", "Barbecue", "Birthday").
- LS-1.2: each list is **recurring or one-off** (`isRecurring`).
- LS-1.3: edit name/flag, delete (soft delete).
- LS-1.4: add/remove catalog items to/from the list, with a quantity.
- LS-1.5: recurring → qty is the monthly default (enters the inventory cycle). One-off → qty is what to buy directly.

### Prices (PR-1)
- PR-1.1: record the price of an item at a store, on a date (default now).
- PR-1.2: price history per item (store, value, date).
- PR-1.3: **cheapest store** (last price per store → the lowest) with a button revealing the store/value/when.
- PR-1.4: **increase alert** when recording a price higher than the last one at the same store.

### Inventory (IN-1)
- IN-1.1: count what's at home per item (`qtyOnHand`).
- IN-1.2: for items on recurring lists: `neededQty = max(monthlyQty − onHand, 0)`.

### Estimated total (TT-1)
- TT-1.1: the list's estimated total = sum(qty × the item's last known price), via `estimateTotal`.
- TT-1.2: shows items with no price as missing; formats in the household's currency.

## Out of scope (later phases)
- Shopping mode / scan-to-check / actual price recalculating (phase 4).
- Real offline sync (phase 3).

## Acceptance criteria
- Create 2 lists (1 recurring, 1 one-off), add items with qty.
- Record prices at 2 stores → the cheapest store is correct; record a higher one → alert.
- Inventory deducts from the monthly default → correct needed-qty.
- The estimated total sums and formats in the household's currency; reflects new prices.
- pt-BR + 5 languages.
