# Facelift v2 — parity total com o protótipo (desktop + mobile)

Decisão do usuário (2026-06-22): **IA exata do design**. App inteiro igual ao protótipo
(`reference/app.jsx` + `screens1-4.jsx`), desktop **e** mobile. Não é reskin de sheets —
é o port visual completo que faltou (shell desktop rail + parity por tela).

## Gap raiz
- Shell atual (`features/catalog/app-layout.tsx`) é **mobile-only** (`max-w-md` + bottom nav).
  Desktop = coluna mobile centrada, **sem rail**. O design tem rail 220px.
- IA da nav diverge: design = `Início/Preços/Estoque/Ajustes` (+ Comprar central);
  app = `home/listas/itens/lojas`.

## IA nova (locada)
| Tab | Rota | Tela design |
|-----|------|-------------|
| Início | `/` | Home (hero economia, cards reposição = listas) |
| Preços | `/itens` (→ `/precos` na fase C) | Precos (busca, compara loja, sparkline) |
| Comprar (central, verde) | `/listas` (escolhe lista → sessão) | — |
| Estoque | `/inventario` | Estoque (needed-qty, scanner) |
| Ajustes | `/ajustes` | Ajustes hub → Histórico/Análise/Casa |

Sub-rotas (lista-detail, historico, analise, membros, lojas, item-form) continuam, acessadas pelas tabs.

## Fases
| # | Fase | Status |
|---|------|--------|
| A | Shell responsivo: rail desktop (logo G + nav + "Casa · Plano") + bottom nav mobile, IA nova, content max-w 760 desktop | ✅ verificado no browser (desktop rail + mobile bottom nav). Bug corrigido: `.botnav` vazava no desktop (vencia `lg:hidden` por ordem de fonte) → `@media(min-width:1024px){.botnav{display:none}}` |
| B | Início: hero economia + cards reposição (emoji, "Hoje é dia", PriceTag melhor preço) + barra identidade | ◑ código feito (2 stats hero + best-deal real), falta QA com dados |
| C | Preços (itens-page já era superset): SectionTitle "Preços"+kicker, "mais barato em {loja}" na row | ✅ (typecheck+build) |
| D | Estoque (inventario): kicker+título "Inventário", botão "Novo item". Badges status **neutros** (DESIGN.md: cor só em dinheiro — protótipo usa vermelho/amarelo, mantive a regra aprovada) | ✅ (typecheck+build) |
| E | Ajustes vira hub no design system (era zinc/antigo): SectionTitle, profile card, seções kicker, .card row-sep (Histórico/Análise/Membros/Lojas/Categorias/Atividades) + dados + conta | ✅ verificado no browser (desktop) |
| F | Auth/ItemForm/lista-detail/listas já portados. **Categorias, Atividades, Onboarding, household-pages (criar casa/convite/loading), Privacidade** + sub-componentes (brands-section, comments-section, barcode-brand-chooser, category-picker, star-rating) tokenizados. **scanner-modal/price-scan-modal** ficam dark (overlay de câmera, intencional). | ✅ (typecheck+build) |
| — | Compra/Recibo + sheets | ✅ (feito antes) |

## Conflito de marca pendente (decisão do usuário)
Protótipo usa Badge **vermelho/amarelo** pro status de estoque (Zerado/Acabando) e
amarelo pro "Plano Pro". DESIGN.md diz **cor só em evento de dinheiro**. Mantive
status de estoque **neutro** (regra aprovada); "Plano Pro" usa amarelo (oferta) como
no protótipo. Se quiser bater 100% com o protótipo (estoque colorido), é trocar os
`Badge tone`.

## Verificação
Cada fase: typecheck + build verdes; QA visual no browser **desktop e mobile** (3 direções × light/dark quando relevante).

## Regras de marca (DESIGN.md)
Cor só em evento de dinheiro. Anton só em dinheiro destaque. Mono em preço tabular. Dinheiro = integer minor units. i18n nos 6 locais — sem string hardcoded.
