# Validation — replenishment-forecast

**Veredito:** PASS ✅ (com 1 gap de cobertura não-bloqueante + 1 gap de i18n)
**Escopo:** commits `4425be9..HEAD` (`244527d` domínio, `a8f0b46` web+i18n).
**Fonte da verdade:** `.specs/features/replenishment-forecast/spec.md`.
**Data:** 2026-07-07 · Verifier independente (não autor).

---

## Gate

| Comando | Resultado |
|---|---|
| `pnpm --filter @grosify/api test` | **312 passed** (25 files) ✅ |
| `pnpm --filter @grosify/web test` | **34 passed** (7 files) ✅ |
| `pnpm typecheck` | **6/6 successful** ✅ |

Contagens batem com o esperado (~312 / ~34).

---

## Cobertura spec-anchored

Testes de domínio: `apps/api/src/test/forecast.test.ts`. UI: inspeção de código.

### S3 — funções puras (100% por teste automatizado)

| AC | Cobertura | Evidência | Outcome |
|---|---|---|---|
| S3/AC1 — só soma `consumption` na janela; ignora purchase/adjustment/count e fora-janela | teste | `forecast.test.ts:49-59` (`toBeCloseTo(4/60)`), `:68-75` | ✅ |
| S3/AC2 — `null` com <2 eventos; senão `consumido/windowDays` | teste | `forecast.test.ts:39-46` (0.1), `:62-65` (null) | ✅ |
| S3/AC3 — `daysUntilOut` null se rate null / ≤0 / qty≤0; senão `floor` | teste | `forecast.test.ts:86-107` | ✅ |

Implementação: `packages/shared/src/domain/replenishment-forecast.ts:20-46`. `dailyConsumptionRate` filtra `type==='consumption'` (`:29`), corta `movedAt < cutoff` (`:30`), acumula `-m.qty` (`:31`), retorna null se `events < FORECAST_MIN_EVENTS` (`:34`). `daysUntilOut` guarda `rate==null || rate<=0 || qtyOnHand<=0` (`:44`) e `Math.floor` (`:45`).

### S1 — dias até acabar (Home + Estoque) · Pro

| AC | Cobertura | Evidência | Outcome |
|---|---|---|---|
| S1/AC1 — ≥2 mov, qty>0, taxa>0 → `floor(qty/taxa)` inteiro ≥0 | teste | `forecast.test.ts:86-90`, fluxo E2E `:111-119` (rate 1/d, qty 3 → 3) | ✅ |
| S1/AC2 — <2 eventos → null (badge some) | teste | `forecast.test.ts:62-65` | ✅ |
| S1/AC3 — `qtyOnHand<=0` → null | teste | `forecast.test.ts:104-107` | ✅ |
| S1/AC4 — taxa 0 ou ≤0 → null | teste | `forecast.test.ts:78-81` (sem consumo→null), `:98-101` (rate≤0→null) | ✅ |
| S1/AC5 — consumos fora dos 60d ignorados | teste | `forecast.test.ts:68-75` (evento a 90d some) | ✅ |
| S1/AC6 — Home mostra item mais crítico (menor daysLeft) como badge neutro; Estoque idem por linha | inspeção | Home: `dashboard-page.tsx:124-128` (loop `soonest`=min daysLeft) + `:255` `<ForecastBadge daysLeft={soonest}/>`. Estoque: `inventario-page.tsx:122` (`daysLeft={forecast.get(item.id)}`) + `:187` badge por linha | ✅ inspeção |

### S2 — free vê teaser, não o número · gate

| AC | Cobertura | Evidência | Outcome |
|---|---|---|---|
| S2/AC1 — free não computa nem exibe (não vaza número) | inspeção | `use-replenishment-forecast.ts:30` (`if (plan !== 'pro') return forecast;` — Map vazio) | ⚠️ só inspeção — ver gap G1 |
| S2/AC2 — free: teaser discreto "Previsão — Pro" na Home e Estoque; toca → `PaywallSheet('forecast')` | inspeção | Teaser: `forecast-badge.tsx:24-39` (botão → `PaywallSheet feature="forecast"`). Home: `dashboard-page.tsx:231` (`plan==='free' && lists.length>0`). Estoque: `inventario-page.tsx:109` (`plan==='free' && rows.length>0`) | ✅ inspeção |
| S2/AC3 — pro: teaser não aparece (só badges reais) | inspeção | mesmos guards `plan === 'free'` acima → teaser só no free | ✅ inspeção |

Paywall: `paywall-sheet.tsx` — `PaywallFeature` inclui `'forecast'`; pitch → `billing.forecastPaywallPitch`.

### Edge cases (tabela do spec)

| Caso | Esperado | Coberto |
|---|---|---|
| 0 movimentos | null | `forecast.test.ts:63` (`[]`→null) ✅ |
| 1 evento em 60d | null | `:64` ✅ |
| qtyOnHand≤0 | null | `:104-107` ✅ |
| só compras/contagens (taxa 0) | null | `:78-81` ✅ |
| consumo alto + estoque baixo | daysLeft pequeno | `:111-119` (→3) ✅ |
| consumos >60d, sobram <2 | null | `:68-75` ✅ |
| daysLeft no limite | floor (conservador) | `:88` (11/2→5) ✅ |

**Placar:** 12/12 ACs (S1×6, S2×3, S3×3) satisfeitos. 6 por teste automatizado, 6 por inspeção (todos os de UI/gate). 7/7 edge cases da tabela cobertos por teste.

### DESIGN.md — badge neutro

`ForecastBadge` usa `tone="neutral"` (`forecast-badge.tsx:14`). DESIGN.md §10: cor/vernáculo de encarte (etiqueta amarela = `oferta`) **só em eventos de dinheiro**; previsão não é preço → neutral correto. CSS `gro-badge--neutral` = cinza sobre fundo cinza sutil (`styles.css:65`), sem cor de dinheiro. ✅ Conforme.

---

## Sensor (mutation testing) — 4 mutações

Cada uma aplicada isolada, testada, restaurada com `git checkout` + `git status` limpo antes da próxima. `@grosify/shared` resolve via `exports: "./src/index.ts"` (source direto, sem build) → mutação no source pega imediatamente nos testes.

| # | Mutação | Local | Resultado | Detalhe |
|---|---|---|---|---|
| a | janela 60d → 6d (`FORECAST_WINDOW_DAYS`) | `replenishment-forecast.ts:4` | **KILLED** ✅ | 1 fail: `forecast.test.ts:45` — evento a 30d sai da janela, sobra 1 → null ≠ 0.1 |
| b | mínimo 2 → 0 (`FORECAST_MIN_EVENTS`) | `replenishment-forecast.ts:7` | **KILLED** ✅ | 3 fails: `:62-65`, `:68-75`, `:78-81` — casos de "poucos eventos → null" deixam de retornar null |
| c | free: remover early-return do hook | `use-replenishment-forecast.ts:30` | **SURVIVED** ❌ | web suite 34/34 passa — nenhum teste cobre o gate Pro-only do hook |
| d | `floor` → `ceil` no daysLeft | `replenishment-forecast.ts:45` | **KILLED** ✅ | 1 fail: `:88` — `daysUntilOut(11,2)` esperado 5 (floor 5.5), ceil dá 6 |

**3 killed / 1 survived.**

### Gap G1 (sobrevivente — mutação c) — cobertura

- **Invariante não testada:** S2/AC1 — plano `free` deve retornar `Map` vazio (privacidade: não computa/vaza o número). Removido o `if (plan !== 'pro') return forecast` (`use-replenishment-forecast.ts:30`), a suíte web permanece 34/34 verde.
- **Confirmação:** `grep` por `forecast|useReplenishmentForecast|ForecastTeaser|ForecastBadge` nos `*.test.ts*` do web → **zero** ocorrências. Nenhum teste exercita o hook nem o gate.
- **Severidade:** média. O gate está correto por inspeção (`:30`), mas é o requisito de *privacidade de custo* mais sensível da feature (S2/AC1 destaca "não vaza o número") e não tem rede de segurança contra regressão. Padrão do projeto já testa gates de plano isolados (`apps/web/src/sync/plan-gates.test.ts` existe) — a lacuna é específica desta feature.
- **Recomendação (não-bloqueante):** teste unitário do hook com `plan='free'` asserindo `Map` vazio mesmo com movimentos+inventário populados; e `plan='pro'` asserindo previsão presente. Alternativa leve: extrair a lógica de agregação (loop `byItem`+`daysUntilOut` por item) para função pura no shared e testá-la como S3.

### Gap G2 — i18n incompleto (fora do sensor, achado por inspeção)

- **Chaves `forecast.*` e `billing.forecastPaywallPitch` estão em inglês (placeholder) em es/it/de/fr** — idênticas ao `en.ts`, não traduzidas:
  - `forecast.daysLeft_one/_other`: es/it/de/fr = `'out in ~{{count}}d'` (só pt e en OK).
  - `forecast.teaser`: es/it/de/fr = `'Replenishment forecast — Pro'`.
  - `billing.forecastPaywallPitch` (`:346`): es/it/de/fr = texto en.
- **Evidência:** `locales/{es,it,de,fr}.ts:116-118` e `:346` vs `pt.ts`/`en.ts`.
- **Severidade:** média. Viola CLAUDE.md do projeto (UI em 6 idiomas, manter os 6 arquivos em sincronia com tradução real) e a intenção de S1/S2 (UI localizada). Não quebra build nem testes (chaves existem, `t()` resolve). É exatamente a mesma classe do commit anterior `c322184` ("traduz chaves da nl-list que ficaram em inglês es/it/de/fr").
- **Recomendação (não-bloqueante):** traduzir as 3 chaves nos 4 locales.

---

## Ranked gaps

1. **G1 (média) — sem teste do gate Pro-only do hook** `use-replenishment-forecast.ts:30`. Único mutante sobrevivente; a invariante de privacidade S2/AC1 não tem rede de segurança.
2. **G2 (média) — i18n placeholder em es/it/de/fr** para `forecast.*` e `billing.forecastPaywallPitch`. Viola a regra dos 6 idiomas do projeto.

Nenhum gap afeta correção da heurística (domínio 100% coberto e sensível: 3/4 mutantes mortos, incluindo janela, mínimo e floor). Ambos são de cobertura/localização, não de lógica.

---

## Tree

`git status --short` = limpo (só este `validation.md` como untracked após a escrita). Todas as 4 mutações restauradas com `git checkout`; nenhum resíduo de mutação no working tree. ✅

## Unresolved questions

- G2 (i18n) está no escopo desta feature ou é follow-up separado como foi o `c322184` da nl-list? (o padrão do repo sugere follow-up, mas as chaves foram introduzidas neste mesmo commit `a8f0b46`.)
