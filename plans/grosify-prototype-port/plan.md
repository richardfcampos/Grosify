# Grosify — Port "Grosify Prototype.html" into apps/web

Source: claude.ai/design project `cde7049d-df22-41d7-9ac1-c34ac9ffcf34`, file `Grosify Prototype.html`
(prototype source mirrored under `./reference/`, screen map in `./SCREENS.md`).

## Goal
Bring the prototype's **visual design** into the existing `apps/web` while keeping its
real data/sync/router/i18n. The prototype is a design exploration over `@grosify/ui`;
`apps/web` already has every screen's logic in plain Tailwind. So this is a **reskin +
design-system adoption**, NOT a logic rebuild.

## User decisions (locked)
- **Target:** Port screens into `apps/web` (real React, Dexie repos, router, i18n).
- **Directions:** Keep all **3** visual directions (Painel / Mercado / Recibo) switchable at runtime + light/dark.

## Key facts
- `apps/web` = TanStack Router + Dexie repos + react-i18next (6 langs) + Tailwind v4. No `@grosify/ui` use today, no theme system, bottom nav of 4 tabs in `features/catalog/app-layout.tsx`.
- `@grosify/ui` (packages/ui) ships: Button, Badge, MoneyValue, PriceTag, Stamp, PriceChange, Card, Chip + `dist/ui.css` exposing `--gro-*` tokens.
- Theme mechanism (prototype `theme.js`): inject one stylesheet, put `data-mode` + `data-dir` on a `.gro-app` root; `@grosify/ui` inherits `--gro-*` from the cascade and re-themes. Reuse verbatim.
- Money already integer-minor-units via `@grosify/shared` (`useFormatMoney`). Anton money type = `@grosify/ui` MoneyValue.
- Brand fonts (Lexend / Anton / IBM Plex Mono) load via Google Fonts `@import` in `@grosify/ui` styles.css.

## Phases
| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation: wire `@grosify/ui`, port theme CSS, `gro-app` shell, theme+direction context/persistence, switcher in Ajustes, fonts, icon component | ✅ done (typecheck+build green) |
| 2 | App shell: restyle `app-layout.tsx` bottom nav (.botnav + icon family) + center "Comprar" cart button + SyncChip→Chip | ✅ done (typecheck+build green). Desktop rail deferred to a later pass. |
| 3 | Home (dashboard) + Listas + Lista detail (saved-hero, restock cards, MoneyValue, Badge) | ✅ done (typecheck+build green). Saved-hero = economia real do mês (estimado−pago em sessions concluídas), só aparece quando >0. Novos locais: `section-title`, `empty`, `money-parts` (símbolo+casas p/ MoneyValue por moeda). Badges de recorrência viraram `neutral` (cor só em evento de dinheiro). |
| 4 | Compra (always-dark session, stamp slam, CheckSheet bottom-sheet, scanner FAB) + Recibo (thermal receipt) | ✅ done (typecheck+build green). Compra força tokens dark via `DARK_VARS` inline (independe do tema do app); header com MoneyValue/kicker/mono/budget `.bar`/pill, rows 64px com `Stamp` (slam via `.stamp-in` keyed por checkedAt) e checkbox quadrado, `.fab` scanner amarelo, finish = `Button` primary. Summary virou Recibo: hero verde + recibo térmico (`.receipt`/`.receipt-edge`, GROSIFY + lista·loja + data, linhas mono, TOTAL/ECONOMIA) + anexar foto + Compartilhar/Início. Novas chaves i18n (6 locais): `shopping.savedLabel/overLabel/vsEstimated/receiptTotal/receiptSavings/toHome`. **Deferido**: `CheckItemSheet` (bottom-sheet de marcar) ainda no estilo antigo — funcional; repolir no passe final. |
| 5 | Preços + PreçoDetail (search, sparkline, store compare) + Análise (bars by category/month) | ☐ |
| 6 | Inventário + ItemForm + Casa(membros/lojas) + Histórico + Auth + Onboarding visual pass | ☐ |
| 7 | i18n sweep (all 6 locales), QA against DESIGN.md/brand rules, cleanup | ☐ |

## Brand rules (from prototype conventions + CLAUDE.md)
- **Color only on money events** (green=economia/caiu, red=subiu/estourou, yellow=oferta/scanner). Neutral greys everywhere else.
- Money always integer minor units; never hardcode 2 decimals (currency is per-household).
- No hardcoded UI strings — `t('...')` across all 6 locale files.
- All client data via Dexie repository layer.

## Notes
- Scope is large (15 screens). Phases are independently shippable; execute in order.
- Each screen keeps its existing logic/hooks; only presentation changes.
