# Importar NFC-e por QR — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: activate it by name and follow its Execute flow and Critical Rules (per-task cycle implement→gate→atomic commit, adequacy review, Verifier no fim). If the skill cannot be activated, STOP.

**Design**: `.specs/features/nfce-import/design.md`
**Status**: Ready for execution
**Orquestração**: 1 worker por fase (sequencial, mesmo worktree, branch atual). Workers commitam por task; NÃO fazem push/merge. Modelos por fase (justificativa abaixo): P1 sonnet · P2 opus · P3 opus · P4 opus · P5 sonnet · P6 haiku · Verifier opus.

**Justificativa dos modelos**: P1 (parsing puro + schema, padrão conhecido) = sonnet. P2 (fetch+parse de HTML de portal real, 3 parsers + adapter, alto risco de detalhe) = opus. P3 (matching híbrido + embedding + cosine, lógica sutil) = opus. P4 (rotas + quota + cache + máquina de estados de import) = **opus** — a correção da quota/idempotência/cache é o coração do gate de custo; erro aqui vaza dinheiro (chamada externa) ou burla o plano. P5 (client: scanner intercept + revisão + confirm offline, UI sem harness de render) = sonnet. P6 (i18n + docs + estado, mecânico) = haiku.

---

## Test Coverage Matrix

> Guidelines: CLAUDE.md global (rodar lint/testes; sem mocks pra passar build) + harness existente. Sem threshold configurado — strong defaults. Testes derivam dos ACs.

| Code Layer | Test Type | Coverage Expectation | Location | Run Command |
|---|---|---|---|---|
| shared (parseNfceQr/ufFromChave/normalize/quota) | unit | todas as branches; v2+v3; UF válida/inválida; 1:1 com ACs | `apps/api/src/test/nfce-shared.test.ts` (importa @grosify/shared; shared sem runner próprio) | `pnpm --filter @grosify/api test` |
| parsers + adapter | unit (fetch mockado + fixture HTML) | cada UF: fixture→itens; conversão reais→cents; CPF descartado; parse vazio→erro | `apps/api/src/nfce/parsers/*.test.ts`, `infosimples-adapter.test.ts` | idem |
| matching + embedding | unit (Gemini mockado) | fuzzy resolve token; sem chave degrada; ambíguo→embedding; catálogo vazio; cache de embedding | `apps/api/src/nfce/matching.test.ts` | idem |
| roteador NfceLookup | unit | chave RS→svrs, SP→sp, MG→mg, SE±token, BA→uf_unsupported; setNfceLookup | `apps/api/src/nfce/router.test.ts` | idem |
| rotas + quota + cache | integration (pglite) | quota Free 2/Pro 60; cache não conta; erros tipados; idempotência | `apps/api/src/test/nfce-routes.test.ts` | idem |
| client intercept/confirm | unit (fake-indexeddb + fetch mock) | QR SEFAZ abre import; confirm cria price+item; source=import | `apps/web/src/**/nfce*.test.ts` | `pnpm --filter @grosify/web test` |
| UI revisão/scanner | none (sem harness de render) | typecheck + build gate | — | build gate |
| schema/migração/i18n/docs | none | build gate | — | build gate |

## Parallelism Assessment

| Test Type | Parallel-Safe? | Isolation | Evidence |
|---|---|---|---|
| api integration | por arquivo sim (PGlite module-level), intra-arquivo não (TRUNCATE beforeEach) | 1 PGlite por arquivo | `db-integration.test.ts` |
| api/web unit | sim | fetch/idb mockados por arquivo | vitest setup |

Execução sequencial por fase (mesmo worktree) — `[P]` é só ordem-livre dentro da fase.

## Gate Check Commands

| Gate | Quando | Command |
|---|---|---|
| Quick-api | task só api | `pnpm --filter @grosify/api typecheck && pnpm --filter @grosify/api test` |
| Quick-web | task só web | `pnpm --filter @grosify/web typecheck && pnpm --filter @grosify/web test` |
| Build | fim de fase / task sem teste | `pnpm --filter @grosify/ui build && pnpm --filter @grosify/api typecheck && pnpm --filter @grosify/web typecheck && pnpm --filter @grosify/api test && pnpm --filter @grosify/web test` |

---

## Execution Plan

```
P1 (sonnet): T1 → T2                      fundação: shared (chave/UF/normalize/quota) + schema
P2 (opus):   T3 → T4 [P] → T5 [P] → T6    porta NfceLookup + parsers SVRS/SP/MG + adapter Infosimples
P3 (opus):   T7 → T8                      matching fuzzy + embedding Gemini env-gated + cache
P4 (opus):   T9 → T10                     rotas /nfce (lookup/cache) + quota Free/Pro + máquina de import
P5 (sonnet): T11 → T12 [P] → T13          client: scanner intercept + tela de revisão + confirm offline
P6 (haiku):  T14 → T15                    i18n 6 idiomas + docs/checklist operacional + STATE.md
Verifier (opus): pós-T15, automático
```

---

## Task Breakdown

### T1: Shared — parsing de chave/UF, normalização, quota
**What**: `packages/shared/src/nfce.ts`: `parseNfceQr(rawValue)` (extrai chave campo 1 do `p=`, aceita v2 `chave|2|...` e v3 `chave|3|...`, null se não-SEFAZ); `ufFromChave(chave)` (2 díg. IBGE→sigla, null inválido); `NFCE_UF_ROUTES` (cópia embutida de `uri_consulta_nfce.json`: sigla→{portalUrlTemplate, family}); `normalizeDescription(desc)` (uppercase/sem acento/strip unidades+abreviações BR); `NFCE_FREE_QUOTA=2`, `NFCE_PRO_QUOTA=60`, `nfceQuota(plan)`. Export no index.
**Where**: `packages/shared/src/nfce.ts` (+ index) · testes `apps/api/src/test/nfce-shared.test.ts`
**Depends**: none · **Requirement**: NFCE-01/04 · **Tests**: unit · **Gate**: Quick-api
**Done when**: parseNfceQr resolve v2 e v3 e rejeita URL não-SEFAZ; ufFromChave mapeia códigos IBGE; normalizeDescription determinístico; quota Free=2/Pro=60; testes 1:1 com os ACs.
**Commit**: `feat(nfce): parsing de chave/UF, normalização e quota compartilhados`

### T2: Schema — nfce_imports, embedding, cnpj, source import
**What**: migração 0027 (`db:generate`): tabela `nfce_imports` (unique(householdId,chave); status enum pending/parsed/confirmed/failed; itemCount; rawJson jsonb SEM CPF; índice quota (householdId,createdAt)); `items.embedding` jsonb null; `stores.cnpj` text null; adicionar `'import'` ao enum `price_records.source`. Adicionar `nfce_imports` ao TRUNCATE do harness.
**Where**: `apps/api/src/db/schema.ts` · `apps/api/drizzle/0027_*` · `apps/api/src/test/db-integration.test.ts` (TRUNCATE)
**Depends**: none · **Requirement**: NFCE-02/04 · **Tests**: none (schema) · **Gate**: Build
**Done when**: migração gera; unique(household,chave) presente; source aceita 'import'; build verde.
**Commit**: `feat(nfce): schema de imports, cache de embedding, cnpj de loja`

### T3: Porta NfceLookup + roteador + stub
**What**: `nfce/types.ts` (`NfceLookup`, `NfceResult`, `NfceItem` — SEM campo CPF); `nfce/index.ts` roteador `lookupFor(uf)` (family svrs/sp/mg→parser; infosimples→adapter se `INFOSIMPLES_TOKEN` senão erro `state_unsupported`; null→`uf_unsupported`; `setNfceLookup()` p/ testes — espelhar `email/index.ts`).
**Where**: `apps/api/src/nfce/{types,index}.ts` + `apps/api/src/nfce/router.test.ts`
**Depends**: T1 · **Requirement**: NFCE-05 · **Tests**: unit (chave RS→svrs, SP→sp, MG→mg, SE sem token→state_unsupported, BA→uf_unsupported; setNfceLookup injeta fake) · **Gate**: Quick-api
**Commit**: `feat(nfce): porta NfceLookup com roteamento por UF`

### T4: Parsers próprios SVRS/SP/MG [P]
**What**: `nfce/parsers/{svrs,sp,mg}-parser.ts`: fetch (UA de browser, `AbortSignal.timeout`, molde `turnstile.ts`) + parse do HTML → `NfceResult`; **CPF nunca extraído**; conversão reais→cents (`round(valor*100)`, tratar vírgula pt-BR); `<200 linhas` cada. Fixture HTML real por portal.
**Where**: `apps/api/src/nfce/parsers/{svrs,sp,mg}-parser.ts` + `*.test.ts` + `test/fixtures/nfce-{svrs,sp,mg}.html`
**Depends**: T3 · **Requirement**: NFCE-02 · **Tests**: unit — OBRIGATÓRIO: fixture→N itens; conversão "12,90"→1290 (risco 100x); CPF ausente no resultado; parse de HTML vazio→erro (não itens vazios)
**Gate**: Quick-api · **Commit**: `feat(nfce): parsers SVRS, SP e MG do portal da SEFAZ`

### T5: Adapter Infosimples (Sergipe) [P]
**What**: `nfce/infosimples-adapter.ts`: POST na API Infosimples com `INFOSIMPLES_TOKEN` (env-gate; timeout; try/catch→`nfce_provider_error`); mapeia `produtos[]`→`NfceItem[]` (cents, unidade, ean, ncm); descarta CPF; sem token → não instanciável (roteador dá `state_unsupported`).
**Where**: `apps/api/src/nfce/infosimples-adapter.ts` + `infosimples-adapter.test.ts` (fetch mockado)
**Depends**: T3 · **Requirement**: NFCE-05 AC3-4 · **Tests**: unit (JSON mock→itens; conversão cents; token ausente; erro de rede→provider_error; CPF descartado)
**Gate**: Quick-api · **Commit**: `feat(nfce): adapter Infosimples para Sergipe (env-gated)`

### T6: Fetch resiliente + erros tipados do lookup
**What**: consolidar no roteador/parsers o mapeamento de falhas: timeout/HTTP≠200 do portal→`nfce_portal_error`; parse vazio→`nfce_parse_failed`; adapter→`nfce_provider_error`; garantir que NENHUM caminho vaza HTML cru/CPF nos logs (log só {uf, chave parcial, family, status, itemCount}).
**Where**: `apps/api/src/nfce/index.ts`, parsers (retorno de erro tipado) + `apps/api/src/nfce/errors.test.ts`
**Depends**: T4, T5 · **Requirement**: NFCE-07 · **Tests**: unit (cada erro tipado; log não contém CPF/HTML)
**Gate**: Build (fim de fase) · **Commit**: `feat(nfce): erros tipados e logging seguro (LGPD) no lookup`

### T7: Matching híbrido fuzzy + embedding
**What**: `nfce/matching.ts`: `matchItems(itens, catalog)` — normaliza (T1) + fuzzy token-set (`fuzzball`); score alto→matcheado; ambíguo E `GEMINI_API_KEY`→cosine; abaixo do mínimo→"novo" (nome pré-preenchido); catálogo vazio→tudo novo; NCM como prior opcional; **nunca lança sem chave**. `nfce/embedding.ts`: `embed(texts)` Gemini @768d (batch) retorna null sem chave; cosine em memória.
**Where**: `apps/api/src/nfce/{matching,embedding}.ts` (+ dep `fuzzball` em api/package.json) + `matching.test.ts`
**Depends**: T1 · **Requirement**: NFCE-03 · **Tests**: unit — "ARROZ TP1 5KG CAMIL"→"Arroz" só fuzzy; sem GEMINI_API_KEY não chama embed e não lança; ambíguo usa cosine (embed mockado); catálogo vazio→tudo novo
**Gate**: Quick-api · **Commit**: `feat(nfce): matching híbrido fuzzy com embedding Gemini opcional`

### T8: Cache de embedding do catálogo
**What**: gerar/persistir `items.embedding` no create/rename de item (só quando `GEMINI_API_KEY`); matching reusa a coluna e só embeda itens sem cache; helper de invalidação no rename. Sem chave → coluna fica null, matching usa fuzzy.
**Where**: `apps/api/src/nfce/embedding.ts` (helper de cache), hook no create/update de item (`routes/catalog.ts`) + `apps/api/src/test/nfce-embedding-cache.test.ts` (pglite)
**Depends**: T2, T7 · **Requirement**: NFCE-03 AC6 · **Tests**: integration (cache reusado; item novo gera; sem chave→null, matching ok)
**Gate**: Quick-api · **Commit**: `feat(nfce): cache de embedding do catálogo por item`

### T9: Rota /nfce/lookup + máquina de import + cache
**What**: `routes/nfce.ts`: `POST /nfce/lookup {chave,url}` (requireHousehold; zValidator): **cache primeiro** (chave existe→retorna rawJson, status já parsed, NÃO conta quota); senão `lookupFor(uf)`; sucesso→grava `nfce_imports` status `parsed` + itemCount + rawJson (sem CPF) + retorna itens+matching; erros do lookup→status `failed` + código tipado (uf_unsupported 422, state_unsupported 501, portal 504, provider 502, parse 422) **sem contar quota**. `GET /nfce/imports` (lista do mês). Mount em `index.ts:46-53`.
**Where**: `apps/api/src/routes/nfce.ts` · `apps/api/src/index.ts` · `apps/api/src/test/nfce-routes.test.ts`
**Depends**: T3, T7 · **Requirement**: NFCE-02/07 · **Tests**: integration (fake lookup via setNfceLookup: happy→parsed+itens; cache hit não re-consulta; cada erro tipado; idempotência unique(household,chave))
**Gate**: Quick-api · **Commit**: `feat(nfce): rota de lookup com cache e máquina de estados de import`

### T10: Gate de quota Free/Pro
**What**: no `POST /nfce/lookup`, ANTES do portal: count `nfce_imports` do mês-calendário (status IN parsed/confirmed) por `c.get('plan')` — Free≥2→403 `nfce_quota_free`, Pro≥60→429 `nfce_quota_pro`; cache hit e lookups `failed` NÃO contam.
**Where**: `apps/api/src/routes/nfce.ts` (+ helper de contagem) + `apps/api/src/test/nfce-quota.test.ts`
**Depends**: T9 · **Requirement**: NFCE-04 · **Tests**: integration — 2 imports Free→3º 403; flip pro→ok; 60 pro→61º 429; re-scan de chave existente não incrementa; lookup falho não incrementa; virada de mês zera
**Gate**: Build (fim de fase) · **Commit**: `feat(nfce): gate de quota mensal Free/Pro no import`

### T11: Client — scanner intercept + serviço de lookup
**What**: (a) no caller do ScannerModal (compra-page, standalone), `parseNfceQr(rawValue)`→abre import; senão comportamento atual; (b) `lib/nfce-import.ts`: `POST /nfce/lookup`, mapeia erros→`errors.*`, devolve `MatchResult[]`; (c) rota standalone no `router.tsx` (padrão `compraRoute:135`) + botão "Importar nota" no Summary pós-compra (`compra-page.tsx:528+`).
**Where**: `apps/web/src/lib/nfce-import.ts`, `apps/web/src/pages/compra-page.tsx`, `apps/web/src/router.tsx`, novo `pages/importar-nota-page.tsx` + `apps/web/src/lib/nfce-import.test.ts`
**Depends**: T9 · **Requirement**: NFCE-01 · **Tests**: unit (QR SEFAZ dispara import; QR de produto não; erro→código traduzível)
**Gate**: Quick-web · **Commit**: `feat(web): scanner intercepta QR de NFC-e e chama lookup`

### T12: Client — tela de revisão [P]
**What**: `features/nfce/nfce-review.tsx` + subcomponentes (<200 linhas cada): lista `MatchResult[]`; por linha matcheado(trocar)/novo(criar inline, nome pré-preenchido)/ignorar; editar preço/qty; 1 passo de casar/criar loja por CNPJ (reusa padrão `unknown-barcode-sheet:24`).
**Where**: `apps/web/src/features/nfce/{nfce-review,nfce-line-row,nfce-store-step}.tsx`
**Depends**: T11 · **Requirement**: NFCE-06 · **Tests**: none (UI; typecheck) · **Gate**: Quick-web (typecheck)
**Commit**: `feat(web): tela de revisão de itens da NFC-e`

### T13: Client — confirm offline (price + item opt-in)
**What**: confirmar revisão: por linha não-ignorada→`recordPrice(itemId, storeId, priceCents, brandId, source:'import')` (repositório+outbox); linhas "criar"→`createItem`+`addBarcode(ean)` ANTES do preço; casar/criar `store` por CNPJ. Estender `recordPrice`/schema Dexie p/ `source:'import'`.
**Where**: `apps/web/src/db/repositories.ts` (source import), `features/nfce/nfce-review.tsx` (confirm) + `apps/web/src/db/nfce-confirm.test.ts`
**Depends**: T2, T12 · **Requirement**: NFCE-06 AC3 · **Tests**: unit (confirm cria N prices source=import; linha "criar" cria item+barcode antes do preço; ignorada não grava)
**Gate**: Build (fim de fase) · **Commit**: `feat(web): confirmação do import cria preços e itens opt-in`

### T14: i18n — 6 locales
**What**: chaves `nfce.*` (botão import, revisão, matcheado/novo/ignorar, loja, quota-atingida) e `errors.*` (`uf_unsupported`, `state_unsupported`, `nfce_invalid_qr`, `nfce_invalid_key`, `nfce_parse_failed`, `nfce_portal_error`, `nfce_provider_error`, `nfce_quota_free`, `nfce_quota_pro`) em pt (fonte) + en/es/it/de/fr — estrutura idêntica nos 6.
**Where**: `apps/web/src/i18n/locales/{pt,en,es,it,de,fr}.ts`
**Depends**: T11-T13 · **Requirement**: NFCE-06/07 · **Tests**: none · **Gate**: Quick-web (typecheck pega chave faltando)
**Commit**: `feat(i18n): strings de import de NFC-e nos 6 idiomas`

### T15: Docs (checklist operacional) + env + STATE.md
**What**: (a) **criar `docs/setup-checklist-operacional.md`** consolidando TUDO que o dono precisa fazer pra ligar a feature — pedido explícito do usuário (detalhe no bloco abaixo); (b) `.env.example` + `apps/api/.env.example`: `GEMINI_API_KEY`, `INFOSIMPLES_TOKEN` comentadas com nota "sem elas: matching por fuzzy / SE indisponível"; (c) STATE.md: linha de decisão 2026-07-05 (feature nfce-import, escopo/gates/UFs/LGPD); (d) marcar tasks done neste arquivo.
**Where**: `docs/setup-checklist-operacional.md` (novo), `.env.example`, `apps/api/.env.example`, `.specs/project/STATE.md`, este arquivo
**Depends**: T1-T14 · **Requirement**: — · **Tests**: none · **Gate**: Build final
**Commit**: `feat(nfce): checklist operacional, env de exemplo e registro de estado`

> **Conteúdo obrigatório de `docs/setup-checklist-operacional.md`** (consolida billing + nfce — o dono lê 1 doc): Asaas (sandbox → prod: API key, webhook token, base URL); R2 (ativar + token S3 no Cloudflare, `R2_*`); Turnstile (opcional, `TURNSTILE_SECRET` + sitekey); **`GEMINI_API_KEY`** (criar no AI Studio; sem ela o matching cai pra fuzzy — feature funciona); **Infosimples** (criar conta, `INFOSIMPLES_TOKEN`, **decisão de preço/trial pra ligar Sergipe** — piso R$100/mês; sem token SE fica "estado ainda não suportado"); **teste de validação com cupom real** (escanear uma NFC-e de RS/SP/MG de verdade → conferir itens/preços/loja na revisão antes de confirmar). Cada item: o que criar, onde, qual env setar, e o comportamento com/sem a credencial.

---

## Diagram-Definition Cross-Check

| Task | Depends (body) | Diagrama | Status |
|---|---|---|---|
| T1/T2 | none | P1 início | ✅ |
| T3 | T1 | P2 após P1 | ✅ |
| T4/T5 | T3 | P2 [P] entre si | ✅ |
| T6 | T4,T5 | P2 fim | ✅ |
| T7 | T1 | P3 | ✅ |
| T8 | T2,T7 | P3 (T2 na P1 ✓) | ✅ |
| T9 | T3,T7 | P4 após P2/P3 | ✅ |
| T10 | T9 | P4 | ✅ |
| T11 | T9 | P5 após P4 | ✅ |
| T12 | T11 | P5 [P] | ✅ |
| T13 | T2,T12 | P5 fim | ✅ |
| T14 | T11-13 | P6 | ✅ |
| T15 | T1-14 | P6 último | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix exige | Task diz | Status |
|---|---|---|---|---|
| T1 | shared logic | unit | unit | ✅ |
| T2 | schema | none | none (Build) | ✅ |
| T3 | router | unit | unit | ✅ |
| T4/T5 | parsers/adapter | unit + fixture | unit + fixture | ✅ |
| T6 | erros | unit | unit | ✅ |
| T7 | matching/embedding | unit | unit | ✅ |
| T8 | embedding cache | integration | integration | ✅ |
| T9/T10 | rotas/quota | integration | integration | ✅ |
| T11 | client logic | unit | unit | ✅ |
| T12/T13 | UI/confirm | none/typecheck + unit(confirm) | idem | ✅ |
| T14/T15 | i18n/docs/config | none | none | ✅ |

## Status das tasks

- [x] T1 · [x] T2 · [x] T3 · [x] T4 · [x] T5 · [x] T6 · [x] T7 (abc5c62) · [x] T8 (1b4a3f1) · [x] T9 (5d83cdc) · [x] T10 (11ed6b1) · [x] T11 · [x] T12 · [ ] T13 · [ ] T14 · [ ] T15
