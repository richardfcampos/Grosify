# Loja ativa no modo compra

## Problema
No modo compra, cada item exige re-selecionar a loja (default = loja mais barata estimada,
que varia por item). Fricção alta numa compra de 30+ itens, todos na mesma loja.

## Solução
Loja "ativa" por sessão (`shopping_sessions.storeId`, já existe no schema e na API PATCH).

## Requisitos
- R1: Seletor de loja fixo no header do modo compra, lendo/gravando `session.storeId`.
- R2: Ao abrir um item (`CheckItemSheet`), a loja já vem preenchida com a loja ativa.
- R3: Se o usuário trocar a loja dentro do item, ao confirmar a loja ativa passa a ser essa
  (gruda para os próximos itens).
- R4: Sem loja ativa e existindo exatamente 1 loja cadastrada, usar essa como ativa.
- R5: Persiste e sincroniza (offline-first) — sobrevive a reload e troca de aparelho.

## Fora de escopo
- Itens fora da lista no carrinho.
- Preço por loja diferente por item na mesma sessão continua possível (override manual).
