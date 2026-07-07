# Grosify

## Vision

Household grocery shopping app for Brazilian families (pt-BR UI). Solves: "how much am I going to spend this month, where is it cheapest, and what do I actually need to buy?"

## Problem

Families buy the same items every month, but they don't know: how much they have at home, which store is cheapest, whether prices went up, or how much the shopping trip will cost before they go.

## Solution

- **Multiple shopping lists** ("Monthly groceries", "Barbecue", "Birthday"), each one recurring or one-off; recurring lists have default monthly quantities per item
- **Pre-purchase inventory**: counts what you have at home → calculates what's missing
- **Price history** by store/date: cheapest store, price-increase alert
- **Shopping mode**: barcode scanner, real-price recording, running total vs. estimate, "it's cheaper at X" warning
- **Offline-first**: works in the store with no signal; syncs when it comes back
- **Household**: home shared among members (invite by code/link)

## Platforms

Web first (mobile-first PWA). Expo app (iOS/Android) in phase 7, reusing packages.

## Monetization

Freemium + subscription:
- **Free**: 1 household, 30 items, 90-day price history
- **Pro** (~R$9,90/month): unlimited items, full history, export
- Subscription belongs to the household (paid by the owner). Enforcement on the server (sync push).
- Stripe (verify recurring Pix; Mercado Pago fallback behind an interface)

## Principles

YAGNI / KISS / DRY. Boring, proven tech. Initial infra cost ≈$6/month. Everything household-scoped (security). Money always in minor units (integer).

## Success metrics (MVP)

- Dogfood: monthly shopping trip done 100% in the app, offline at the store
- Alpha with a family using lists + prices before phase 4
