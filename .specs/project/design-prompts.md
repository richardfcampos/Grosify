# Prompts de design — rodar quando for desenhar a UI

## 1. Design system (`/design-consultation`)

> App de compras domésticas brasileiro "Grosify" (PWA mobile-first, React+Tailwind). Público: famílias organizando compras do mês. Telas: lista recorrente, inventário de casa, modo compra no mercado (uso com uma mão, celular na vertical, pressa), histórico de preços, scanner de código de barras. Tom: prático, confiável, econômico — sensação de "estou economizando dinheiro". Precisa de: paleta (destaque pra economia/verde? alerta de preço subiu?), tipografia legível em movimento, espaçamento touch-friendly (alvos ≥44px), dark mode. Gerar DESIGN.md + preview de fontes e cores.

## 2. Modo compra (`/frontend-design`)

> Tela "Modo Compra" do Grosify: lista de itens necessários com checkbox grande, botão flutuante de scanner, ao marcar item abre input rápido de preço (teclado numérico, centavos), banner de aviso se preço > último conhecido, chip "tem mais barato em [loja]" expansível mostrando preço+data, header fixo com total corrente vs estimado (verde se abaixo, vermelho se acima). Offline-first, indicador sutil de pendências de sync. Mobile-first 380px, uma mão.

## 3. Dashboard/lista (`/frontend-design`)

> Tela inicial do Grosify: resumo do mês (total estimado da próxima compra, variação vs mês passado), CTA "Fazer inventário" → "Iniciar compra", lista recorrente com qty mensal editável inline, busca + scanner pra adicionar item. Cards simples, hierarquia clara, sem poluição.
