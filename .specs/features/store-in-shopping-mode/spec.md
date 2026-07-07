# Active store in shopping mode

## Problem
In shopping mode, every item requires re-selecting the store (default = the estimated cheapest store, which varies per item). High friction on a 30+ item shopping trip where everything is at the same store.

## Solution
An "active" store per session (`shopping_sessions.storeId`, already in the schema and the PATCH API).

## Requirements
- R1: a fixed store selector in the shopping mode header, reading/writing `session.storeId`.
- R2: when opening an item (`CheckItemSheet`), the store is already prefilled with the active store.
- R3: if the user changes the store within the item, confirming makes that the active store
  (it sticks for the following items).
- R4: with no active store and exactly 1 registered store, use that one as active.
- R5: persists and syncs (offline-first) — survives a reload and a device switch.

## Out of scope
- Items not on the list, added to the cart.
- A different per-store price per item within the same session remains possible (manual override).
