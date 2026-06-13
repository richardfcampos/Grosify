# Feature: Modo Compra (Fase 4 — lançamento MVP)

## Contexto
O coração do app. Acontece no mercado, com uma mão, com pressa, offline. Tela escura (legibilidade de relance, DESIGN.md). Tudo offline-first (fase 3 pronta).

## Requisitos

### Sessão (MC-1)
- MC-1.1: iniciar sessão de compra a partir de uma lista. Snapshot das quantidades necessárias:
  - lista recorrente → `neededQty = max(qtyMensal − emCasa, 0)`
  - lista avulsa → qty da entrada
- MC-1.2: cada item da sessão guarda `estimatedUnitPriceCents` (loja mais barata no momento) + `estimatedPriceStoreId`.
- MC-1.3: status active → completed/abandoned.

### Compra (MC-2)
- MC-2.1: **scan-pra-marcar** — escanear código de barras marca o item correspondente.
- MC-2.2: ao marcar, registrar **preço real** (input rápido) + quantidade real → grava `price_record` (source shopping) e atualiza o item da sessão (`actualUnitPriceCents`, `actualQty`, `checkedAt`).
- MC-2.3: marcar/desmarcar manual também (item pode não escanear).
- MC-2.4: aviso se preço real > último conhecido na loja.
- MC-2.5: chip "tem mais barato em [loja]" (preço/data) expansível se houver loja registrada mais barata.

### Totais (MC-3)
- MC-3.1: header fixo: **total corrente** (itens marcados × preço real) vs **estimado** (necessário × estimativa).
- MC-3.2: cor verde se corrente ≤ estimado, vermelho se acima.
- MC-3.3: recalcula a cada preço registrado.

### Fim (MC-4)
- MC-4.1: completar sessão → resumo (recibo): itens, total, economia vs estimado.
- MC-4.2: recibo no estilo térmico (DESIGN.md), base pra compartilhar (compartilhar WhatsApp = polish fase 6).

## Fora de escopo
- Compartilhar recibo no WhatsApp (fase 6).
- Loja da sessão obrigatória (store opcional; preço real carrega a loja escolhida no item).

## Critérios de aceite
- Iniciar sessão de lista recorrente → itens com needed-qty e estimativa.
- Escanear/marcar item → registrar preço real → total corrente atualiza, carimbo aparece.
- Preço real acima do último → aviso. Loja mais barata registrada → chip.
- Completar → resumo com economia. 100% offline.
- pt-BR + 5 idiomas.
