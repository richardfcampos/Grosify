# Design System — Grosify

## Product Context
- **What this is:** Household grocery shopping app — monthly recurring list, inventory, per-store price history, offline shopping mode with a scanner.
- **Who it's for:** Brazilian families organizing the month's grocery shopping.
- **Space/industry:** Grocery list apps (Bring!, AnyList, Listonic) × price intelligence.
- **Project type:** Mobile-first PWA (React + Tailwind); Expo app in phase 7.

## Aesthetic Direction
- **Direction:** "Smart Market" — utilitarian-vernacular. A calm, trustworthy base; the vernacular of Brazilian sales flyers (yellow price tag, price splash, stamp) appears **only during money events**.
- **Decoration level:** Intentional — strict discipline: if every screen shouts, it's a flyer; if it shouts only when your wallet is at stake, it's a tool.
- **Mood:** "This app is on my side and helps me save." Sober while planning, emphatic about price.
- **Reference research:** The category converges on generic rounded pastel (Listonic/AnyList/Bring!). Grosify's differentiator: treat the user as a money manager, not someone ticking off little chores.

## Typography
- **Money display:** **Anton** — ONLY for headline monetary values (the "Saved R$ X" hero, offer splash, shopping-mode total). Minor units as superscript (`R$ 4⁹⁹`). Never for body text.
- **UI/Body/Headings:** **Lexend** — designed from legibility research; readable on the move. Variable weight 300–800.
- **Tabular data/prices:** **IBM Plex Mono** — price tables, history, receipts. `font-variant-numeric: tabular-nums`. Mono = auditable record = trust.
- **Loading:** Google Fonts (`Anton`, `Lexend`, `IBM+Plex+Mono`); migrate to self-hosting via Fontsource when optimizing the PWA.
- **Scale:** 12 / 14 / 15 (base) / 16 / 18 / 22 / 28 / 38 / 56px. Minimum body size 15px (legibility in motion).

## Color
- **Approach:** Restrained, with 3 semantic money colors.
- **Savings Green** `#15803D` — primary; savings, price dropped, total below estimate. Dark: `#4ADE80`.
- **Increase Red** `#DC2626` — price increase, total over budget. Dark: `#F87171`.
- **Tag Yellow** `#FACC15` — offer/cheapest price/scanner FAB. **Only during price events** (-3° rotation, hard 2–3px shadow with no blur). Text on yellow is always `#1C1917`.
- **Neutrals:** Ink `#1C1917` · Gray `#78716C` · Border `#E7E5E4` · Light background `#FAFAF7` (warm, not pure white) · Surface `#FFFFFF`.
- **Dark mode:** Background `#0C0A09`, surface `#1C1917`, border `#292524`, text `#FAFAF7`, gray `#A8A29E`, info `#93C5FD`.
- **Extra semantic:** Stamp/info Blue `#1D4ED8` (the "✓ BOUGHT" stamp, links).
- **Mode rule:** the app follows the system theme preference (light/dark) — **including Shopping Mode** (revised 2026-06-22; previously always dark). The thermal receipt always stays light (paper).

## Spacing
- **Base unit:** 8px (4px sub-step).
- **Density:** dense-comfortable.
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64).
- **Touch:** targets ≥48px in general; shopping-mode rows ≥64px with the entire row tappable.

## Layout
- **Approach:** grid-disciplined, single-column, mobile-first.
- **Grid:** 1 column ≤480px; on desktop = the same column centered at `max-width: 480px` (app-like). Management screens (history) may expand to 720px.
- **Navigation:** fixed bottom nav with 4 tabs — List · Inventory · Shop · Prices.
- **Border radius:** sm 6px (tags) · md 12px (buttons, inputs) · lg 16px (cards) · xl 28px (modals/sheets). Receipt: radius 0 + serrated border.

## Motion
- **Approach:** minimal-functional + 1 expressive moment.
- **Easing:** enter ease-out · exit ease-in · move ease-in-out.
- **Duration:** micro 50–100ms · short 150–250ms · medium 250–400ms.
- **Expressive moment:** the "✓ BOUGHT" stamp — a -8° rotated slam with haptics (navigator.vibrate) when an item is checked off. No confetti, no bounce on anything else.
- **Screen transitions:** View Transitions API — the content rises (translateY 12px) + fades in (ease-out ~0.34s); the shell (nav/rail) stays stable (quick cross-fade). No support → simple fade (`.screen-in`). The snapshot does not affect `position:fixed`.
- **theme-color (PWA):** the status bar follows the mode's `--app-bg` (light `#fafaf7` / dark `#0c0a09`), never the brand color — adjusted at runtime by the ThemeProvider.

## Product signatures (approved risks)
1. **Price as protagonist:** the home screen opens with an Anton splash of the amount saved this month; offers as a rotated yellow price tag.
2. **Immersive shopping mode:** a fullscreen, nav-free screen with a live stamp + total; follows the app's light/dark theme (revised 2026-06-22 — previously always dark).
3. **Stamp + receipt:** checking off an item = a diagonal blue stamp; end of shopping = a thermal receipt (Plex Mono, serrated border) shareable on WhatsApp.

## Anti-patterns (forbidden)
- Gradients (any), purple/violet as an accent, decorative blobs.
- 3-column grids with icons in colored circles.
- The default checkbox in shopping mode (use the stamp).
- Tag Yellow outside a price event.
- Inter/Roboto/Poppins/Montserrat.
- Float for money (always integer minor units + `formatBRL`).

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-12 | System created via /design-consultation | Visual research (Bring!/AnyList/Listonic) + an outside voice (the "Street-Market Poster" subagent) + a disciplined synthesis; the user approved all 3 risks |
| 2026-06-22 | Shopping Mode is no longer always dark → follows the app's light/dark theme | Prototype update (export v2); the user approved reverting the signature. The thermal receipt stays light (paper). compra-page tokenized (DARK_VARS removed) |
