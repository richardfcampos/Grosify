# Grocify-parity — programa de features

Trazer o Grosify à paridade com os itens selecionados do plano do Grocify.
Ordem por dependência + custo/valor. Cada fase = um commit verificado (typecheck+build+test).

## Decisões travadas (usuário, 2026-06-18)
- Tempo real (colaboração) = **SSE poke** (servidor avisa, client puxa). Encaixa no sync atual.
- Gráficos (analytics) = **Recharts**.
- Categorias = **entidade completa** (nome/ícone/cor/ordem, sistema+custom, ocultar, reordenar). Migra texto atual.
- Scanner código desconhecido = **OpenFoodFacts com fallback offline**.
- Notificações push: **fora desta leva** (usuário não pediu item 4). Alertas de orçamento = só in-app.

## Fases

| # | Fase | Schema? | Depende |
|---|------|---------|---------|
| 1 | Quick wins: offline polish + scanner (QR/torch/vibrar/OFF) + alerta preço 10%/média 3m | não | — |
| 2 | Item: notas, marca preferida, conversão de unidades | sim (items.notes, item_brands.is_preferred) | — |
| 3 | Listas: ícone+cor, recorrência configurável, preferências de exibição | sim (lists.icon/color/recurrence/recurrence_day) | — |
| 4 | Categorias como entidade (migração texto→tabela) + CRUD/reordenar/ocultar | sim (categories, items.category_id) | — |
| 5 | Modo compra: estoque ao finalizar, ocultar comprados, agrupar p/ categoria, quick-add, swipe | não | 4 (agrupar) |
| 6 | Inventário/estoque: mínimo+low-stock, ledger de movimentos, consumo (manual/scan/batch), ajuste c/ motivo, contagem física | sim (items.min_stock, stock_movements) | — |
| 7 | Orçamento (por lista + alerta in-app) + Analytics (Recharts) + foto recibo + rating 1-5 | sim (lists.budget_cents, price_records.receipt_key/rating) | 4 (gasto/categoria) |
| 8 | Geração automática de lista: status draft/active/done, tela de revisão, excluir suficientes, cron auto-gen | sim (lists.status, generated_at) | 3 (recorrência) |
| 9 | Colaboração: papéis Admin/Viewer+permissões, remover membro, feed atividades, comentários, atribuir tarefa, SSE poke | sim (members.role enum, activities, item_comments, session_item.assigned_to) | — |
| 10 | Busca/filtros avançados (marca/categoria/recentes/autocomplete/filtros/ordenação/salvos) + export CSV/PDF + restore | sim? (saved_filters local) | 4 (categoria) |

## Convenções (deste repo)
- Toda tabela de domínio: syncColumns (updated_at, deleted_at, server_version) + trigger `assign_server_version`.
- id UUIDv7 gerado no client. Rotas household-scoped (household_id da sessão).
- Repository Dexie local-first + outbox; pull adiciona tabela ao engine.
- i18n: 6 locales em sincronia, sempre `t('...')`, nunca string hardcoded.
- Dinheiro em centavos; qty numeric(10,3).
- Sem referência a plano/finding em código/migração (nomes de domínio só).

## Status
Fase 1: em andamento.
