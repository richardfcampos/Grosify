# Screen map: prototype → apps/web

Each row: prototype screen (reference fn) → existing page (keep its logic) → visual treatment to apply.
`@grosify/ui` = G.*. Re-fetch exact prototype source per screen from DesignSync project
`cde7049d-df22-41d7-9ac1-c34ac9ffcf34` path `app/screensN.jsx` when porting that screen.

| Prototype (fn @ file) | apps/web page | Treatment to port |
|---|---|---|
| **Onboarding** (entry.jsx) | `features/onboarding/*` (exists, untracked) | 3-slide carousel; segmented progress bars; Vignette mock cards (list/price/stamp); G.Button "Próximo/Começar"; "Pular"→auth. |
| **Auth** (entry.jsx) | `auth-pages.tsx` EntrarPage/CadastroPage | Centered card, G logo, kicker labels, mono inputs for email/senha, G.Button primary fullWidth, toggle entrar↔criar. |
| **Home** (Home, screens1) | `dashboard-page.tsx` | Identity bar (G mark + casa name + G.Chip synced + clock→histórico). Hero card: kicker "Você economizou em {mês}", big MoneyValue tone=positive scaled by `dir.money`. Stat row (PriceTag for "melhor preço"). Restock list = `card tap` rows: emoji, name + Badge "Hoje é dia" when due, "{n} itens faltando · {k} sem preço", estimado mono, chev. Footer G.Button "Iniciar compra" + secondary "Inventário". |
| **Listas** (—) | `listas-page.tsx` | Card rows per list w/ icon, recurrence Badge, item count, budget; FAB create. (No direct prototype screen; follow Lista/Home card idiom.) |
| **Lista detail** (Lista, screens1) | `lista-detail-page.tsx` | Header emoji + name + Badges (recurrence, "Orçamento {f}"). Empty state via Empty(list). Total-estimado card + Badge "{n} a comprar". G.Button "Iniciar compra". `card row-sep` item rows: CatIcon, name, "Comprar {n} {un} · {loja}" + Badge oferta, cheapest mono + G.PriceChange. Ghost "Adicionar item". |
| **Comprar review** (—) | `comprar-review-page.tsx` | Apply card/row idiom; keep qty-edit + exclude-in-stock logic. |
| **Compra** (Compra+CheckSheet, screens2) | `compra-page.tsx` (fullscreen) | **Always dark** (`#0c0a09`, DARK_VARS). Sticky header: "No carrinho" MoneyValue (tone neg if over) vs "Estimado" mono + ▲/▼ delta; budget bar (green/yellow/red by %); "{done}/{n} comprados" + ocultar comprados pill. Category groups; item buttons 64px min; checked→line-through + **G.Stamp** with `.stamp-in` slam + `.row-bought` row flash + `navigator.vibrate(18)`. FAB scanner (yellow). CheckSheet bottom-sheet: qty stepper (Anton number), preço pago mono input + Badge "subiu" + delta, G.Button "Marcar comprado · {total}". Finish bar G.Button "Finalizar compra · {current}". |
| **Scanner** (Scanner, screens4) | scanner used by compra/inventario/item-form | Dark viewfinder, yellow corner brackets, `.scanline`, manual code input, "Simular leitura". Wire to real barcode flow (existing scanner in compra-page/item-form). |
| **Recibo** (Recibo, screens2) | post-`completeSession` view (new sub-screen of compra or historico) | Green hero card "Você economizou" MoneyValue. **Thermal receipt**: `.receipt` + `.receipt-edge` serrated top/bottom, mono, GROSIFY header, dashed rules, item lines "{qty} × {f}", TOTAL, ECONOMIA green. G.Button Compartilhar + Início. |
| **Preços** (Precos, screens1) | (new `/precos` or fold into itens) | SectionTitle. Search card (search icon + input). `card row-sep` rows: name, "Mais barato em {loja}", Sparkline(hist), cheapest mono + G.PriceChange. Empty(search). |
| **PreçoDetail** (PrecoDetail, screens1) | item price detail (new or in item form) | Title + cat. Card: "Mais barato hoje" MoneyValue positive + PriceTag; big Sparkline; "Média 90 dias". `card row-sep` store table sorted asc, Badge "aqui" + green price on cheapest. G.Button "Registrar preço". |
| **Análise** (Analise, screens3) | `analytics-page.tsx` (recharts today) | Total 6-meses MoneyValue. Month bar chart (last bar green). Gasto por categoria: labeled `.bar` rows (ink fill). Itens mais caros `card row-sep` ranked. Replace recharts w/ prototype's plain bars OR keep recharts but reskin tokens — prefer plain to match. |
| **Inventário** (Estoque, screens2) | `inventario-page.tsx` | SectionTitle "Inventário". `.seg` filter Todos/Acabando/Zerado + ghost "Novo item". `card row-sep` rows: name, "{cat} · comprar {n}", Badge subiu(Zerado)/oferta(Acabando), "em casa" kicker + Anton qty. Empty(box). |
| **ItemForm** (ItemForm, screens4) | `item-form-page.tsx` | Title novo/editar. Photo dashed placeholder. FieldWrap kicker labels; bordered inputs; cat/unidade selects; rec/onHand mono number inputs; barcode card + Escanear; G.Button Salvar + secondary Excluir. |
| **Casa** (Casa, screens3) | `membros-page.tsx` + `lojas-page.tsx` (merge view) | Invite card (mono dashed code + Copiar). Membros `card row-sep`: avatar initial, name + "você", Badge role. Lojas `card row-sep`: store icon, name, "{hood} · {city}", chev. |
| **Histórico** (Historico, screens3) | `historico-page.tsx` | `card row-sep` rows: date block (mono month + Anton day), store, "{n} itens", total mono + G.PriceChange(-saved). Footer card "Economia acumulada" MoneyValue positive. |
| **Ajustes** (Ajustes, screens2) | `ajustes-page.tsx` | Profile card + Plano Badge. **Aparência card: Tema seg (Claro/Escuro) + Direção visual seg (Painel/Mercado/Recibo) with tagline** ← the runtime switcher. Keep existing language picker, invite, backup, sync, logout as `card row-sep` Rows. |

## Shared primitives to build (apps/web/src/features/ui/)
- `icon.tsx` (from reference/icons.jsx) · `theme-provider.tsx` (mode+dir context, localStorage `gro.mode`/`gro.dir`, persists, sets data-* on root) · `sheet.tsx` (bottom sheet) · `empty.tsx` · `sparkline.tsx` · `section-title.tsx` · `kicker/muted/mono` via global CSS classes.
- Re-export `@grosify/ui` components through a local barrel for consistent import.
