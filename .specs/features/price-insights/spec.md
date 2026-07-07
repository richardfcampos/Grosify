# Insights de preço (`price-insights`)

**Status:** especificada · **Plano:** Pro-only (free vê teaser) · **Escopo:** 100% client-side (Dexie `price_records`) + funções de domínio puras no shared.

## Problema

O `PrecoSheet` já mostra "mais barato em X", média 90d e alerta vs última compra — mas não responde as duas perguntas que o usuário faz na hora de comprar: **"compro agora ou espero cair?"** e **"tem marca mais barata na mesma loja?"**. Os dois insights derivam do histórico local de preços do item.

## Escopo & privacidade

Ambos os insights são **Pro-only**. O gate vive nas funções puras (padrão `buildForecastMap`): a função recebe `plan` como 1º argumento e retorna `null` sem computar nada quando `free` — o veredito nem existe pro free (invariante de privacidade). Free vê só um teaser de 1 linha que abre `PaywallSheet('priceInsights')`.

**Atenção à janela:** o `PrecoSheet` filtra o histórico a 90d pro plano free (`historyCutoff`). Os insights Pro operam sobre o histórico **completo** (`allPrices`, sem cutoff), mas cada função aplica internamente sua própria **janela de 90 dias** por relevância (preço velho não deve pesar num veredito de "agora").

## Heurística cravada

Constantes exportadas do shared (coerentes com `PRICE_ALERT_THRESHOLD_PCT = 10`):

- `INSIGHTS_WINDOW_DAYS = 90` — janela de relevância dos dois insights (bate com `avg3m` e `FREE_HISTORY_DAYS`).
- `INSIGHTS_MIN_RECORDS = 3` — mínimo de registros na janela pro veredito buy/wait.
- `BUY_BELOW_AVG_PCT = 3` — atual ≤ média·0,97 → sinal de compra.
- `WAIT_ABOVE_AVG_PCT = 5` — atual ≥ média·1,05 (E subindo) → sinal de espera.
- `SWAP_MIN_SAVINGS_PCT = 10` — economia mínima (%) pra sugerir troca de marca (reusa o limiar de alerta).

"Atual" = preço do registro **mais recente** (na janela). "Média" = `averagePrice` dos registros vivos na janela (reusa a função existente). Direção "subindo/caindo" olha os últimos N registros vivos por `recordedAt` asc.

## Stories

### S1 — Compre agora ou espere · Pro

**Como** membro Pro, **quero** um veredito sobre a tendência do preço **para** decidir se compro agora ou espero cair.

`buyOrWaitVerdict(plan, records, now)` → `{ verdict: 'buy'|'wait'|'neutral', currentCents, avgCents } | null`.

- **AC1** — WHEN `plan === 'free'`, THEN retorna `null` sem computar (gate de privacidade — o veredito nem existe pro free).
- **AC2** — WHEN há menos de `INSIGHTS_MIN_RECORDS` (3) registros vivos na janela de 90d, THEN retorna `null` (dados insuficientes).
- **AC3** — WHEN o preço atual ≤ média·(1 − 0,03) (média·0,97), THEN `verdict = 'buy'` (está abaixo da média — bom momento).
- **AC4** — WHEN os últimos 3 registros são **estritamente decrescentes** (`p₁ > p₂ > p₃`), THEN `verdict = 'buy'` mesmo que ainda não esteja abaixo da média (tendência de queda).
- **AC5** — WHEN o preço atual ≥ média·(1 + 0,05) (média·1,05) **E** os últimos 2 registros são estritamente crescentes (`p₁ < p₂`), THEN `verdict = 'wait'` (caro e subindo).
- **AC6** — WHEN não há sinal claro (nem condição de buy nem de wait), THEN `verdict = 'neutral'`.
- **AC7 (precedência)** — WHEN as condições de buy e wait colidem (ex.: acima da média mas 3 últimos caindo), THEN **buy vence** (a queda recente é o sinal mais acionável).

### S2 — Substituição mais barata (troca de marca) · Pro

**Como** membro Pro, **quero** ver que uma marca é N% mais barata que outra na mesma loja **para** trocar e economizar.

`cheaperBrandSwap(plan, records, now)` → `{ storeId, cheaperBrandId, pricierBrandId, cheaperCents, pricierCents, savingsPct } | null`.

- **AC1** — WHEN `plan === 'free'`, THEN retorna `null` sem computar (gate de privacidade).
- **AC2** — WHEN existe uma loja com ≥2 marcas **distintas e não-nulas** que têm último-preço na janela de 90d nessa mesma loja, THEN compara a marca mais barata contra a mais cara nessa loja.
- **AC3** — WHEN a economia da marca mais barata vs a mais cara é ≥ `SWAP_MIN_SAVINGS_PCT` (10%), THEN retorna o par `{cheaperBrandId, pricierBrandId, savingsPct}` daquela loja. `savingsPct` = `round((pricier − cheaper) / pricier · 100)`.
- **AC4** — WHEN a economia é < 10%, THEN retorna `null` (diferença irrelevante — não vale sugerir troca).
- **AC5 (múltiplas lojas)** — WHEN há pares elegíveis em mais de uma loja, THEN vence o de **maior economia percentual** (empate: maior economia absoluta em cents).
- **AC6** — usa o **último** preço de cada (loja, marca) na janela (`latestPriceByStoreBrand` reusado, pré-filtrado por janela).

## Edge cases (cobrir em teste)

- **1 registro só** → S1 `null` (AC2); S2 `null` (sem 2 marcas).
- **Tudo mesma marca** (ou tudo `brandId = null`) → S2 `null` (não há 2 marcas distintas).
- **Marcas diferentes em lojas diferentes sem interseção** → S2 `null` (comparação é por-loja; marca X só na loja A, marca Y só na loja B não formam par).
- **Preços velhos fora da janela de 90d** → ignorados; se sobram <3 na janela, S1 `null`; se sobra <2 marcas na loja, S2 `null`.
- **Registros `deletedAt != null`** → sempre ignorados (reusa `isLive`).
- **Diferença de marca exatamente no limiar (10%)** → sugere (≥, inclusivo).

## Funções puras (shared)

`packages/shared/src/domain/price-insights.ts`:
- `buyOrWaitVerdict(plan, records, now)` e `cheaperBrandSwap(plan, records, now)`.
- Constantes e tipos exportados. Testes 1:1 com os ACs em `apps/api/src/test/price-insights.test.ts`.

## UI

`PrecoSheet` → seção `price-insights-section.tsx` (se estourar 200 linhas):
- **Pro:** card do veredito buy/wait/neutral (verde/vermelho permitido — é evento de preço, DESIGN.md) + linha de troca de marca quando `cheaperBrandSwap` não é `null`.
- **Free:** teaser de 1 linha → `PaywallSheet('priceInsights')`. Não computa os vereditos (gate antes do cálculo).

i18n: chaves `priceInsights.*` + `billing.priceInsightsPaywallPitch` (pt real; placeholder inglês nos 5 outros idiomas — lote de tradução vem depois).
