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
| C | Preços: rota `/precos` dedicada (busca, PriceChange, sparkline, compara loja) | ⬜ |
| D | Estoque: parity inventário (seg, needed-qty Anton, scanner) | ⬜ |
| E | Ajustes hub → Histórico / Análise / Casa (membros+lojas) parity | ⬜ |
| F | ItemForm, Lista detail, Auth, Onboarding parity (revisão) | ⬜ |
| — | Compra/Recibo + sheets | ✅ (feito antes) |

## Verificação
Cada fase: typecheck + build verdes; QA visual no browser **desktop e mobile** (3 direções × light/dark quando relevante).

## Regras de marca (DESIGN.md)
Cor só em evento de dinheiro. Anton só em dinheiro destaque. Mono em preço tabular. Dinheiro = integer minor units. i18n nos 6 locais — sem string hardcoded.
