# Spec — Preço opcional na compra + backfill pela NFC-e

## Objetivo
Comprar sem travar no preço. A pessoa marca o item no supermercado com **loja + quantidade** (obrigatórios) e o **preço fica opcional** — preenche depois manualmente OU deixa a NFC-e preencher. Itens fora da lista original também entram (com ou sem preço).

## Decisões (confirmadas pelo usuário)
1. **Marcar comprado exige loja + quantidade; preço é opcional.**
2. **NFC-e faz backfill na sessão**: importar a nota casa as linhas com os itens comprados-sem-preço da compra atual e preenche os preços (usuário revisa/confirma).

## Estado atual (scout)
- Schema `shoppingSessionItemSchema`: `actualUnitPriceCents` **já é nullable** → sem mudança de modelo.
- `checkSessionItem(...)` (repositories.ts): exige `actualUnitPriceCents: number`, sempre chama `recordPrice`.
- `CheckItemSheet`: input de preço com `required`; confirmar `disabled={busy || !storeId || !value}` (exige preço).
- Totais da compra (compra-page): já pulam item sem preço (`si.actualUnitPriceCents && si.actualQty`).
- `QuickAddSheet`: adiciona item fora da lista → cai no mesmo `CheckItemSheet`.
- NFC-e: import assíncrono já grava `price_records` e casa itens no catálogo (matchLinesForHousehold).

## Plano

### Parte 1 — Preço opcional ao comprar
- `checkSessionItem`: `actualUnitPriceCents: number | null`; só chama `recordPrice` quando não-null.
- `CheckItemSheet`: preço não-`required`; confirmar habilita com **loja + qtd** (sem exigir preço). Se preço vazio → grava null.

### Parte 2 — Preencher preço depois (manual)
- Reabrir item já comprado no `CheckItemSheet` pré-preenche loja/qtd/preço atuais; salvar com preço → grava + `recordPrice`.
- Indicador visual "sem preço" no item comprado (badge) + no `Summary` ("N itens sem preço").

### Parte 3 — Item fora da lista já com preço
- Herda a parte 1: QuickAdd → CheckItemSheet com preço opcional. Sem código novo além do que a parte 1 entrega.

### Parte 4 — Backfill pela NFC-e na sessão
- No fluxo de import (NfceReview) quando há uma **sessão de compra ativa** da mesma casa:
  - casar cada linha da nota (via matching existente) com itens **comprados-sem-preço** da sessão;
  - propor preencher `actualUnitPriceCents` desses itens com o preço da nota (tela de revisão, usuário confirma);
  - aplicar → grava preço no item da sessão + `recordPrice`.
- Não mexe no que a nota já faz (histórico de preços); adiciona a etapa de backfill da sessão.

## Arquivos
- `apps/web/src/db/repositories.ts` — `checkSessionItem` nullable + backfill helper.
- `apps/web/src/features/shopping/check-item-sheet.tsx` — preço opcional.
- `apps/web/src/pages/compra-page.tsx` — badge "sem preço" + Summary.
- `apps/web/src/features/nfce/nfce-review.tsx` (+ possível novo componente de backfill) — parte 4.
- i18n (6 idiomas) — labels de "sem preço", "preencher depois", backfill.
- Testes: `checkSessionItem` null, matching de backfill.

## Ordem de entrega
Partes 1-3 (núcleo, rápido) → commit/deploy → Parte 4 (backfill) → commit/deploy.

## Questões em aberto
- Parte 4: casar por `itemId` (item já resolvido no matching) — linhas da nota "novo" (sem item) não têm o que backfillar na sessão; entram só como preço no histórico. OK?
