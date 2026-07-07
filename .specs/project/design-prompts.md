# Design prompts — run these when designing the UI

## 1. Design system (`/design-consultation`)

> Brazilian household grocery shopping app "Grosify" (mobile-first PWA, React+Tailwind). Audience: families organizing the monthly shopping. Screens: recurring list, home inventory, in-store shopping mode (one-handed use, phone held vertically, in a hurry), price history, barcode scanner. Tone: practical, trustworthy, thrifty — a feeling of "I'm saving money". Needs: palette (highlight for savings/green? price-went-up alert?), typography legible on the move, touch-friendly spacing (targets ≥44px), dark mode. Generate DESIGN.md + a preview of fonts and colors.

## 2. Shopping mode (`/frontend-design`)

> Grosify "Shopping Mode" screen: list of needed items with a large checkbox, floating scanner button; checking an item opens a quick price input (numeric keypad, minor units), a warning banner if price > last known, an expandable "cheaper at [store]" chip showing price+date, a fixed header with running total vs. estimate (green if below, red if above). Offline-first, subtle sync-pending indicator. Mobile-first 380px, one-handed.

## 3. Dashboard/list (`/frontend-design`)

> Grosify home screen: month summary (estimated total of the next shopping trip, change vs. last month), "Do inventory" → "Start shopping" CTA, recurring list with inline-editable monthly qty, search + scanner to add an item. Simple cards, clear hierarchy, no clutter.
