# Design System — Grosify

## Product Context
- **What this is:** App de compras domésticas — lista recorrente mensal, inventário, histórico de preços por loja, modo compra offline com scanner.
- **Who it's for:** Famílias brasileiras organizando as compras do mês.
- **Space/industry:** Grocery list apps (Bring!, AnyList, Listonic) × price intelligence.
- **Project type:** PWA mobile-first (React + Tailwind); app Expo na fase 7.

## Aesthetic Direction
- **Direction:** "Mercado Inteligente" — utilitário-vernacular. Base calma e confiável; vernáculo de encarte brasileiro (etiqueta amarela, splash de preço, carimbo) aparece **apenas em eventos de dinheiro**.
- **Decoration level:** Intentional — disciplina rígida: se toda tela grita, é panfleto; se grita só quando o bolso está em jogo, é ferramenta.
- **Mood:** "Esse app tá do meu lado e me faz economizar." Sóbrio no planejamento, enfático no preço.
- **Reference research:** Categoria converge em pastel arredondado genérico (Listonic/AnyList/Bring!). Diferencial Grosify: tratar o usuário como gestor de dinheiro, não executor de tarefinha.

## Typography
- **Display de dinheiro:** **Anton** — SÓ para valores monetários em destaque (hero "Economizou R$ X", splash de oferta, total do modo compra). Centavos em sobrescrito (`R$ 4⁹⁹`). Nunca para texto.
- **UI/Corpo/Títulos:** **Lexend** — desenhada por pesquisa de legibilidade; lê-se andando. Variable weight 300–800.
- **Dados/Preços tabulares:** **IBM Plex Mono** — tabelas de preço, histórico, recibo. `font-variant-numeric: tabular-nums`. Mono = registro auditável = confiança.
- **Loading:** Google Fonts (`Anton`, `Lexend`, `IBM+Plex+Mono`); migrar para self-host via Fontsource quando otimizar PWA.
- **Scale:** 12 / 14 / 15 (base) / 16 / 18 / 22 / 28 / 38 / 56px. Corpo mínimo 15px (legibilidade em movimento).

## Color
- **Approach:** Restrained com 3 cores semânticas de dinheiro.
- **Verde Economia** `#15803D` — primário; economia, preço caiu, total abaixo do estimado. Dark: `#4ADE80`.
- **Vermelho Subiu** `#DC2626` — aumento de preço, total estourado. Dark: `#F87171`.
- **Amarelo Etiqueta** `#FACC15` — oferta/melhor preço/scanner FAB. **Só em eventos de preço** (rotação -3°, sombra dura 2-3px sem blur). Texto sobre amarelo sempre `#1C1917`.
- **Neutros:** Tinta `#1C1917` · Cinza `#78716C` · Borda `#E7E5E4` · Fundo claro `#FAFAF7` (quente, não branco puro) · Superfície `#FFFFFF`.
- **Dark mode:** Fundo `#0C0A09`, superfície `#1C1917`, borda `#292524`, texto `#FAFAF7`, cinza `#A8A29E`, info `#93C5FD`.
- **Semantic extra:** Azul Carimbo/info `#1D4ED8` (carimbo "✓ COMPRADO", links).
- **Regra de modo:** app segue a preferência de tema (light/dark) do sistema — **incluindo o Modo Compra** (revisado em 2026-06-22; antes era sempre escuro). O recibo térmico permanece sempre claro (papel).

## Spacing
- **Base unit:** 8px (sub-passo 4px).
- **Density:** denso-confortável.
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64).
- **Touch:** alvos ≥48px em geral; linhas do modo compra ≥64px com a linha inteira tocável.

## Layout
- **Approach:** grid-disciplined, coluna única mobile-first.
- **Grid:** 1 coluna ≤480px; desktop = mesma coluna centrada `max-width: 480px` (app-like). Telas de gestão (histórico) podem expandir a 720px.
- **Navegação:** bottom nav fixa 4 abas — Lista · Estoque · Comprar · Preços.
- **Border radius:** sm 6px (etiquetas) · md 12px (botões, inputs) · lg 16px (cards) · xl 28px (modais/sheets). Recibo: radius 0 + borda serrilhada.

## Motion
- **Approach:** minimal-functional + 1 momento expressivo.
- **Easing:** enter ease-out · exit ease-in · move ease-in-out.
- **Duration:** micro 50-100ms · short 150-250ms · medium 250-400ms.
- **Momento expressivo:** carimbo "✓ COMPRADO" — slam rotacionado -8° com vibração (navigator.vibrate) ao marcar item. Sem confetti, sem bounce em mais nada.

## Assinaturas do produto (riscos aprovados)
1. **Preço protagonista:** home abre com splash Anton do valor economizado no mês; ofertas como etiqueta amarela rotacionada.
2. **Modo compra imersivo:** tela fullscreen sem nav, carimbo + total ao vivo; segue o tema light/dark do app (revisado 2026-06-22 — antes era sempre escuro).
3. **Carimbo + recibo:** marcar item = carimbo azul diagonal; fim da compra = recibo térmico (Plex Mono, borda serrilhada) compartilhável no WhatsApp.

## Anti-padrões (proibido)
- Gradientes (qualquer), roxo/violeta como acento, blobs decorativos.
- Grid de 3 colunas com ícones em círculos coloridos.
- Checkbox padrão no modo compra (usar carimbo).
- Amarelo Etiqueta fora de evento de preço.
- Inter/Roboto/Poppins/Montserrat.
- Float para dinheiro (sempre centavos integer + `formatBRL`).

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-12 | Sistema criado via /design-consultation | Pesquisa visual (Bring!/AnyList/Listonic) + voz externa (subagent "Cartaz de Feira") + síntese disciplinada; usuário aprovou os 3 riscos |
| 2026-06-22 | Modo Compra deixa de ser sempre escuro → segue o tema light/dark do app | Update do protótipo (export v2); usuário aprovou a reversão da assinatura. Recibo térmico continua claro (papel). compra-page tokenizado (DARK_VARS removido) |
