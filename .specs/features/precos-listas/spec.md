# Feature: Preços + Listas (Fase 2)

## Contexto
App fica útil: organiza compras em listas, sabe quanto custa e onde está mais barato. Domínio (`cheapestStore`, `priceChange`, `neededQty`, `estimateTotal`) já testado no shared. Preços na moeda da casa (unidades mínimas).

## Requisitos

### Listas múltiplas (LS-1)
- LS-1.1: criar várias listas nomeadas ("Compras do mês", "Churrasco", "Aniversário").
- LS-1.2: cada lista é **recorrente ou avulsa** (`isRecurring`).
- LS-1.3: editar nome/flag, excluir (soft delete).
- LS-1.4: adicionar/remover itens do catálogo à lista, com quantidade.
- LS-1.5: recorrente → qty é o padrão mensal (entra no ciclo de inventário). Avulsa → qty é o que comprar direto.

### Preços (PR-1)
- PR-1.1: registrar preço de um item numa loja, numa data (default agora).
- PR-1.2: histórico de preços por item (loja, valor, data).
- PR-1.3: **loja mais barata** (último preço por loja → menor) com botão revelando loja/valor/quando.
- PR-1.4: **alerta de aumento** ao registrar preço maior que o último na mesma loja.

### Inventário (IN-1)
- IN-1.1: contar o que tem em casa por item (`qtyOnHand`).
- IN-1.2: para itens de listas recorrentes: `neededQty = max(qtyMensal − emCasa, 0)`.

### Total estimado (TT-1)
- TT-1.1: total estimado da lista = soma(qty × último preço conhecido do item), via `estimateTotal`.
- TT-1.2: mostra itens sem preço como faltantes; formata na moeda da casa.

## Fora de escopo (fases seguintes)
- Modo compra / scanner-pra-marcar / preço real recalculando (fase 4).
- Sync offline real (fase 3).

## Critérios de aceite
- Criar 2 listas (1 recorrente, 1 avulsa), adicionar itens com qty.
- Registrar preço em 2 lojas → loja mais barata correta; registrar maior → alerta.
- Inventário desconta do padrão mensal → needed-qty correto.
- Total estimado soma e formata na moeda da casa; reflete novos preços.
- pt-BR + 5 idiomas.
