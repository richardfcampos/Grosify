# Grosify — project instructions

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Project
- Specs and decisions in `.specs/project/` (PROJECT.md, ROADMAP.md, STATE.md).
- **i18n**: UI in 6 languages (pt default, en, es, it, de, fr) via react-i18next. NEVER hardcode a string in a component — always `t('...')` with a key in `apps/web/src/i18n/locales/*.ts` (keep all 6 files in sync). The API returns error codes (`already_in_household`), never text — the client translates via `errors.*`.
- Money is always in the currency's minor units (integer) — `formatCurrency`/`parseToMinorUnits` from `@grosify/shared`. Currency is per household (`membership.currency`, ISO 4217 via native Intl — no currency library). Never assume 2 decimal places (JPY=0, BHD=3).
- Shopping lists are multiple per household (`shopping_lists`), each either `isRecurring` or one-off.
- Local ports: API 3010, web 5174, Postgres 5433 (docker compose).
- All client data access goes through the repository layer (Dexie) — groundwork for the phase 3 offline sync.
- Every API route is household-scoped: `household_id` comes from the session, never from the body.
