## Grosify UI — how to build with this system

Grosify is a Brazilian household-shopping app. The visual rule that defines the
brand: **the app is sober when planning and loud only about money.** Green, red,
and yellow appear ONLY on money events (savings, price increases, offers). Neutral
greys carry everything else. Breaking this rule makes the UI read like a flyer
instead of a tool — keep accent colors out of non-money UI.

### Setup — no provider needed
Components are presentational and read no React context. To use them: load the
bundle (`window.GrosifyUI.*`) and link the single `styles.css` once. That stylesheet
`@import`s the brand fonts (remote) and all component CSS — nothing else to wire.
There is no theme provider, no required wrapper.

### Money is always integer minor units
`MoneyValue` and `PriceChange` take **`cents` / `deltaCents` as integers** (centavos),
never floats — e.g. `cents={1850}` renders `R$ 18⁵⁰`. Currencies vary in decimals
(JPY=0, BRL=2, BHD=3) via the `decimals` prop. Never pass `18.50`.

### Styling idiom
Component styling ships in the bundle — you do NOT add classes to style the
components themselves. For your own layout glue, use inline styles or your own
classes, and reach for the design tokens (CSS custom properties, defined globally
in `styles.css`) so layout stays on-brand:

| Token | Use |
|---|---|
| `--gro-green` `#15803d` | economia / preço caiu / total abaixo do estimado |
| `--gro-red` `#dc2626` | aumento de preço / total estourado |
| `--gro-yellow` `#facc15` | oferta / melhor preço / scanner (money events only) |
| `--gro-ink` `#1c1917` · `--gro-gray` `#78716c` | texto / texto secundário |
| `--gro-border` `#e7e5e4` · `--gro-bg` `#fafaf7` · `--gro-surface` `#fff` | bordas / fundo quente / superfície |
| `--gro-stamp` `#1d4ed8` | carimbo "✓ COMPRADO", info |
| `--gro-font-ui` Lexend · `--gro-font-money` Anton · `--gro-font-mono` IBM Plex Mono | UI / dinheiro em destaque / preços tabulares |

### Component vocabulary
`Button` (`variant` primary/secondary/ghost, `size` sm/md/lg, `fullWidth`),
`Badge` (`tone` economia/subiu/oferta/neutral), `MoneyValue` (Anton, superscript
cents), `PriceTag` (yellow flyer label), `Stamp` ("✓ COMPRADO"), `PriceChange`
(↓ green / ↑ red, mono tabular), `Card` (`elevated`), `Chip` (sync status:
default/synced/error/muted).

### Where the truth lives
Read `styles.css` (and its `@import` closure) for tokens and component styling, and
each component's `.prompt.md` + `.d.ts` for its API before composing.

### Idiomatic snippet
```tsx
<Card elevated>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div>
      <div style={{ fontFamily: 'var(--gro-font-ui)', fontWeight: 600 }}>Arroz 5kg</div>
      <Badge tone="oferta">Melhor preço</Badge>
    </div>
    <MoneyValue cents={2490} size="sm" />
  </div>
</Card>
```
