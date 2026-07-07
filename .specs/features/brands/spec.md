# Feature: Brands on items

## Context
An item is generic ("Beans 1kg"); the same need has several brands (Camil, Kicaldo, Tio João), different prices, and its own barcode per brand. I want to compare which brand is cheapest and, during shopping, record the brand I actually took (the usual one may be out of stock).

## Decisions (locked)
- A brand is **optional** (an item can have 0+ brands; "Banana" has no brand).
- The shopping list holds the **generic item**; the brand is chosen **at shopping time**.
- "Cheapest" cross-references **all brands** of the item → shows brand + store + price.

## Requirements
- MK-1: an item has 0+ brands (name). Brand CRUD within the item.
- MK-2: a barcode belongs to a **brand** of the item (brand_id optional — a barcode can belong to the item with no brand).
- MK-3: a price record stores the **brand** (in addition to item, store, date). brand_id optional.
- MK-4: "cheapest store" and the estimate consider the cheapest brand across all of them; the price-increase alert compares the same store **and** the same brand.
- MK-5: during shopping (CheckItemSheet) I choose the brand taken (dropdown of the item's brands + create a new one on the spot). The actual price is recorded with the brand.
- MK-6: the scanner resolves a barcode → (item, brand). If unknown: an easy flow to pick/create an item + pick/create a brand + paste the code, all in one sheet. Usable both in shopping mode and in item setup.
- MK-7: the session item stores the purchased brand (actual_brand_id).

## Out of scope
- Photo/target-price per brand (YAGNI; the photo stays per item).
- A mandatory brand.

## Acceptance criteria
- Create item "Beans 1kg" with 2 brands, each with its own barcode.
- Record the price of 2 brands across stores → "cheapest" shows the correct brand + store.
- During shopping: choose a brand, record the price; if it's out of stock, pick/create another brand on the spot.
- Scan a new code → create/select item + brand + paste the code without leaving the flow.
- Everything offline-first, 6 languages.
