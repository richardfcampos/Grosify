# Validation — price-insights

**Veredito:** PASS ✅
**Escopo verificado:** commits `0aebc09..HEAD` (`54d946d` domínio, `4d70ccb` web) contra `spec.md` (relido do zero).
**Data:** 2026-07-07 · **Papel:** VERIFIER independente (sem correção/commit/push).

## Gate

| Comando | Resultado |
|---|---|
| `pnpm --filter @grosify/api test` | 332 passed (26 files) |
| `pnpm --filter @grosify/web test` | 38 passed (9 files) |
| `pnpm typecheck` | 6/6 tasks OK |

Contagens batem com o esperado (~332 / ~38).

## Cobertura spec-anchored — funções puras (`packages/shared/src/domain/price-insights.ts`)

Testes em `apps/api/src/test/price-insights.test.ts`.

### S1 — `buyOrWaitVerdict(plan, records, now)`

| AC | Regra do spec | Teste (file:line) | Assertion | Ancora no código |
|---|---|---|---|---|
| AC1 | free → `null` sem computar (gate privacidade) | test:47-50 | `buyOrWaitVerdict('free', …)` → `null` | `price-insights.ts:60` early-return `plan !== 'pro'` |
| AC2 | < 3 registros na janela → `null` | test:53-54 | 2 registros → `null` | `:63` `asc.length < INSIGHTS_MIN_RECORDS` |
| AC3 | atual ≤ média·0,97 → buy | test:58-62 | média 1000, atual 900 → `'buy'` | `:82` `<= round(avg·(1−3/100))` |
| AC4 | 3 últimos estritamente caindo → buy (mesmo acima da média) | test:65-71 | 1300→1200→1100 acima da média → `'buy'`, `current > avg` | `:75-76` `falling3` + `:87` |
| AC5 | atual ≥ média·1,05 E 2 últimos subindo → wait | test:74-78 | média 1000, atual 1200, 1100→1200 → `'wait'` | `:83` `aboveAvg` + `:80` `rising2` + `:88` |
| AC6 | sem sinal claro → neutral | test:81-85 | atual≈média, sem tendência → `'neutral'` | `:86` default `'neutral'` |
| AC7 | precedência buy > wait quando colidem | test:88-92 | caro mas 3 caindo → `'buy'` | `:87` `if (buy)` **antes** de `:88 else if (wait)` |

Edges S1: 1 registro → `null` (test:95-97); fora da janela 90d sobram <3 → `null` (test:100-104); `deletedAt` ignorado sobram 2 → `null` (test:107-114). Todos cobertos por `liveInWindowAsc` (`:28-33`, filtra `deletedAt===null` E `recordedAt>=start`).

### S2 — `cheaperBrandSwap(plan, records, now)`

| AC | Regra do spec | Teste (file:line) | Assertion | Ancora no código |
|---|---|---|---|---|
| AC1 | free → `null` sem computar | test:119-125 | `'free'` → `null` | `:114` early-return |
| AC2+AC3 | ≥2 marcas na mesma loja, economia ≥10% → par | test:128-143 | X1000/Y800 STORE_A → `{cheaper:Y, pricier:X, savingsPct:20}` | `:130-139` loop por loja, `:136-138` savingsPct |
| AC4 | economia <10% → `null` | test:146-153 | 1000/950 (5%) → `null` | `:139` `< SWAP_MIN_SAVINGS_PCT` continue |
| limiar | exatamente 10% → sugere (inclusivo) | test:156-163 | 1000/900 → `savingsPct 10` | `:139` `<` (não `<=`) preserva o 10 |
| AC5 | múltiplas lojas → maior economia % | test:166-178 | STORE_A 15% vs STORE_B 40% → STORE_B | `:151-156` comparação `savingsPct` + tiebreak abs |
| AC6 | usa o ÚLTIMO preço de cada (loja,marca) | test:181-190 | X 2000(velho)/1000(novo) → pricier 1000 | `:118` `latestPriceByStoreBrand(inWindow)` |

Edges S2: 1 marca só → `null` (test:193-198); tudo `brandId=null` → `null` (test:201-205, `:123` skip `brandId==null`); marcas em lojas diferentes sem par → `null` (test:208-214, agrupamento por loja `:121-127`); marca só fora da janela → `null` (test:217-224).

**Score spec-anchored:** 13/13 ACs (S1 AC1-7 = 7, S2 AC1-6 = 6). +8 edges/limiares cobertos.

## Cobertura por inspeção — UI (não coberta por teste automatizado, exceto o gate web)

| Item spec | Verificação |
|---|---|
| Gate web (invariante privacidade) | `use-price-insights.test.ts:40-52`: free retorna ambos `null` com dados RICOS; pro computa buy + swap 20% com os MESMOS dados. Prova que o `null` do free é o gate, não falta de dados. |
| `buildPriceInsights` pura | `use-price-insights.ts:26-35` delega às funções de domínio passando `plan` como 1º arg. `usePriceInsights` opera sobre `allPrices` (histórico COMPLETO, sem cutoff 90d) — `preco-sheet.tsx:74`. |
| Pro card veredito | `price-insights-section.tsx:53-61` renderiza card buy/wait/neutral + `:63-72` linha de swap quando `!= null`. |
| Free teaser 1 linha → PaywallSheet | `:31-44` botão abre `PaywallSheet('priceInsights')`; componente só renderiza (gate já ocorreu no cálculo). |
| DESIGN.md verde/vermelho | PERMITIDO (evento de preço): buy `green-800`, wait `red-700`, swap `green-700` — coerente com DESIGN.md L24-25 (Savings Green `#15803D` price-dropped / Increase Red `#DC2626` price-increase). |
| i18n 6 idiomas | pt/en/es/it/de/fr todos têm bloco `priceInsights` (title, teaser, verdict.{buy,wait,neutral}, swap) + `billing.priceInsightsPaywallPitch`. Mesma estrutura de 5 chaves nos 6. pt real; en/es/it/de/fr placeholder inglês (permitido pelo spec: "placeholder inglês nos 5 outros idiomas — lote de tradução vem depois"). |
| PaywallSheet integração | `paywall-sheet.tsx`: `'priceInsights'` adicionado a `PaywallFeature` + branch de pitch. |

## Sensor — 4 mutações (uma por vez, restaurada com `git checkout`, tree limpa entre cada)

| # | Mutação | Efeito esperado | Resultado | Killed |
|---|---|---|---|---|
| a | limiar buy 0,97 → 1,02 (`BUY_BELOW_AVG_PCT 3 → -2`) | quase tudo vira buy | api 1 fail: `neutral quando não há sinal claro` | ✅ |
| b | mínimo registros 3 → 1 (`INSIGHTS_MIN_RECORDS`) | dados insuficientes deixa de barrar | api 4 fails: `<3 registros`, `1 registro só`, `fora da janela sobram <3`, `ignora apagados` | ✅ |
| c | remover early-return do gate `plan` nas 2 funções puras | free passa a computar | api 2 fails (`free … S1`, `free … S2`) + web 1 fail (`free retorna ambos null … dados ricos`) | ✅ |
| d | economia mínima swap 10% → 0% (`SWAP_MIN_SAVINGS_PCT`) | diferenças irrelevantes viram sugestão | api 1 fail: `null quando economia é menor que 10%` | ✅ |

**Sensor score:** 4/4 mutações killed. Cada limiar/invariante crítico do spec tem um teste que o pega. Notável: mutação (c) — a invariante de privacidade Pro-only — é pega em DOIS níveis (domínio + gate web), confirmando defesa em profundidade.

## Ranked gaps

Nenhum. Os 13 ACs, os edges do spec, os 5 limiares cravados (0,97 / 1,05 / mín 3 / 2 marcas / 10%) e a precedência buy>wait estão todos ancorados em teste que morre sob mutação. UI conforme por inspeção (i18n 6 estruturas sincronizadas, cores DESIGN.md-compliant, gate antes do cálculo).

Observações não-bloqueantes (fora do escopo de correção do VERIFIER):
- AC5 do wait exige "2 últimos subindo" (não 3). Spec S1/AC5 diz "últimos 2 registros … `p₁ < p₂`" — código `:79-80` `last2` bate exatamente. Consistente.
- en/es/it/de/fr usam texto inglês placeholder — explicitamente autorizado pelo spec (L77). Lote de tradução é trabalho futuro fora deste escopo.

## Tree

Limpa exceto este `validation.md`. Todas as 4 mutações restauradas via `git checkout` (verificado com `git status --porcelain` após cada uma).
