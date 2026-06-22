# design-sync notes — @grosify/ui

Repo-specific gotchas for future syncs of the Grosify design system.

## Build / converter

- **`packages/ui` must be built first**: `pnpm --filter @grosify/ui build` (Vite lib mode → `dist/index.es.js` + `dist/index.d.ts` + `dist/ui.css`). The converter reads `dist/`, not `src/`.
- **`--entry` must be an ABSOLUTE path** to `packages/ui/dist/index.es.js`. A repo-relative `./dist/index.es.js` resolves against cwd (repo root) and fails `[NO_DIST]`; the pkg-relative form is ambiguous. Use `"$PWD/packages/ui/dist/index.es.js"`.
- **`--node-modules packages/ui/node_modules`** — react/react-dom/@types/react resolve there (pnpm symlinks). With the absolute entry, `[DTS_REACT]` does NOT fire (@types/react resolves from the pkg dir). A repo-root entry made it misfire.
- `cssEntry: dist/ui.css` (Vite names the single lib CSS after the package, not `style.css`).
- tsconfig needs `rootDir: src` so `vite-plugin-dts` emits `dist/index.d.ts` (not `dist/src/index.d.ts`); `src/css.d.ts` (`declare module '*.css'`) stops dts choking on the CSS side-effect import.

## Fonts

- `[FONT_REMOTE]` for Lexend / Anton / IBM Plex Mono is EXPECTED and non-blocking — `styles.css` loads them via a Google Fonts `@import`. Not shipped as `@font-face`/woff2 by design (DESIGN.md: self-host via Fontsource is a future optimization). If the brand ever self-hosts, switch to `cfg.extraFonts`.

## Scope

- 8 components, all standalone/presentational (no provider, no app deps). Group = `general` (no per-component docs → no category frontmatter).
- The web app's `apps/web/src/features/*` components are NOT synced — they're app-coupled (Dexie/router/i18n). `packages/ui` is the brand-bearing, reusable subset, built fresh for this sync. A future refactor could migrate the web app onto `packages/ui`.

## Re-sync risks

- Previews use realistic pt-BR money copy; if component props change, re-grade the affected `.design-sync/previews/<Name>.tsx`.
- `conventions.md` enumerates tokens/components — validate names against the fresh build on every re-sync (a renamed token silently desyncs the header).
- Brand fonts are network-fetched at runtime (`@import`); offline render checks fall back to system fonts but that's cosmetic.
