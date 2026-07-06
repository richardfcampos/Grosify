# Lista por linguagem natural — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: activate it by name and follow its Execute flow and Critical Rules (per-task cycle implement→gate→atomic commit, adequacy review, Verifier no fim). If the skill cannot be activated, STOP.

**Design**: `.specs/features/nl-list/design.md`
**Status**: Ready for execution
**Orquestração**: 1 worker por fase (sequencial, mesmo worktree, branch atual). Workers commitam por task; NÃO fazem push/merge. Modelos por fase (justificativa abaixo): P1 opus · P2 opus · P3 sonnet · P4 haiku · Verifier opus.

**Justificativa dos modelos**: P1 (cliente Gemini `generateContent` + prompt engineering + parse/validação zod — código de rede novo, JSON estruturado, retry) = **opus**. P2 (rota + gate Pro + rate limit + extração/reuso do matching + integration pglite — o gate de custo e o reuso sem regressão do NFC-e são o coração) = **opus**. P3 (client: entrada dupla + revisão generalizada + confirm offline — padrão conhecido, UI sem harness de render) = sonnet. P4 (i18n 6 + STATE.md + env + tracker, mecânico) = haiku.

---

## Test Coverage Matrix

> Guidelines: CLAUDE.md global (rodar lint/testes; sem mocks pra passar build) + harness existente (pglite api, fake-indexeddb web). Sem threshold configurado — strong defaults. Testes derivam dos ACs.

| Code Layer | Test Type | Coverage Expectation | Location | Run Command |
|---|---|---|---|---|
| gemini-generate (generateContent) | unit (fetch mockado) | JSON válido→GeneratedLine[]; sem chave→null; JSON inválido→null (retry no caller); timeout→null; array vazio→[] | `apps/api/src/nfce/gemini-generate.test.ts` | `pnpm --filter @grosify/api test` |
| adaptador + match-for-household | unit | GeneratedLine→NfceItem (preço 0, unit normalizada); matchLinesForHousehold casa/novo; catálogo vazio→tudo novo | `apps/api/src/nfce/match-for-household.test.ts` | idem |
| rota /ai/generate-list + gate + rate limit | integration (pglite, fetch mock) | free→403 pro_required; pro→200; 11ª/min→429; sem chave→501; JSON inválido→retry→502; array vazio→200 []; prompt curto/longo→400 | `apps/api/src/test/ai-generate-list.test.ts` | idem |
| client confirm offline | unit (fake-indexeddb) | target new→1 lista + N entradas; target existing→N entradas na lista; item repetido upsert; linha "criar" cria item antes da entrada; ignorada não grava | `apps/web/src/db/nl-confirm.test.ts` | `pnpm --filter @grosify/web test` |
| client serviço de geração | unit (fetch mock) | erro tipado→código traduzível; pro_required tratado à parte | `apps/web/src/lib/nl-list.test.ts` | idem |
| UI revisão/entradas | none (sem harness de render) | typecheck + build gate | — | build gate |
| nfce-line-row generalizado (showPrice/showStore) | none (typecheck garante default) | build gate — NFC-e não muda | — | build gate |
| i18n/docs/env | none | build gate (typecheck pega chave faltando) | — | build gate |

## Parallelism Assessment

| Test Type | Parallel-Safe? | Isolation | Evidence |
|---|---|---|---|
| api integration | por arquivo sim (PGlite module-level), intra-arquivo não (TRUNCATE beforeEach) | 1 PGlite por arquivo | `db-integration.test.ts` |
| api/web unit | sim | fetch/idb mockados por arquivo | vitest setup |

Execução sequencial por fase (mesmo worktree) — `[P]` é só ordem-livre dentro da fase.

## Gate Check Commands

> **Lição do CI da 8ª feature**: incluir o `pnpm typecheck` DO MONOREPO no gate Build — typecheck por-filtro não pega quebra cross-package (shared↔api↔web). O gate Build roda o typecheck agregado do monorepo além dos por-pacote.

| Gate | Quando | Command |
|---|---|---|
| Quick-api | task só api | `pnpm --filter @grosify/api typecheck && pnpm --filter @grosify/api test` |
| Quick-web | task só web | `pnpm --filter @grosify/web typecheck && pnpm --filter @grosify/web test` |
| Build | fim de fase / task sem teste | `pnpm typecheck && pnpm --filter @grosify/ui build && pnpm --filter @grosify/api test && pnpm --filter @grosify/web test` |

---

## Execution Plan

```
P1 (opus):   T1 → T2                 cliente Gemini generateContent + adaptador/extração do matching
P2 (opus):   T3 → T4                 rota /ai/generate-list (gate Pro + rate limit + erros) + integration
P3 (sonnet): T5 → T6 [P] → T7        client: entrada dupla + revisão generalizada + confirm offline
P4 (haiku):  T8 → T9                 i18n 6 idiomas + STATE.md/env/tracker
Verifier (opus): pós-T9, automático
```

---

## Task Breakdown

### T1: Cliente Gemini — generateContent + parse/validação
**What**: `apps/api/src/nfce/gemini-generate.ts`: `generateShoppingList(prompt, env?)` — POST em `…/models/gemini-2.0-flash:generateContent?key=…` com `generationConfig.responseMimeType='application/json'` + `responseSchema` (array de `{name, qty, unit}`); system instruction curta (monta lista de compras, itens genéricos c/ qty+unidade, responde no idioma do prompt, sem marcas); `AbortSignal.timeout`; retorna **null** sem `GEMINI_API_KEY` (→ caller 501) ou em falha/JSON inválido (→ caller retry/502); valida a saída por **zod** (descarta linha sem `name`). Molde EXATO do `embedding.ts:36`. Tipo `GeneratedLine = {name, qty, unit}`.
**Where**: `apps/api/src/nfce/gemini-generate.ts` + `apps/api/src/nfce/gemini-generate.test.ts`
**Depends**: none · **Requirement**: NL-01 · **Tests**: unit (fetch mock: JSON válido→lines; sem chave→null; JSON quebrado→null; timeout→null; array vazio→[]) · **Gate**: Quick-api
**Done when**: parse valida schema; sem chave devolve null; falha devolve null (sem lançar); zod descarta linha inválida.
**Commit**: `feat(nl-list): cliente Gemini generateContent com structured output`

### T2: Adaptador + extração do matching por casa
**What**: (a) extrair `matchItemsForHousehold` de `routes/nfce.ts:165` pra `apps/api/src/nfce/match-for-household.ts` (`matchLinesForHousehold(householdId, items)`: `loadCatalog`→`embedAndCacheCatalog`→`matchItems`); `routes/nfce.ts` passa a importar daqui (move-refactor puro — sem mudar comportamento). (b) `generatedToNfceItem(line)`: `{descricao:line.name, quantidade:line.qty, unidade:normalizeUnit(line.unit), valorUnitCents:0, valorTotalCents:0, ean:null}`; `normalizeUnit` mapeia a string do modelo pro enum `Unit` (default `'un'`). **NÃO tocar a assinatura de `matchItems`.**
**Where**: `apps/api/src/nfce/match-for-household.ts` (novo), `apps/api/src/routes/nfce.ts` (import), `apps/api/src/nfce/match-for-household.test.ts`
**Depends**: T1 · **Requirement**: NL-01/NL-02 · **Tests**: unit (adaptador monta NfceItem c/ preço 0 e unit normalizada; matchLinesForHousehold casa/novo; catálogo vazio→tudo novo) · **Gate**: Quick-api (roda também os testes de rota do NFC-e — provam paridade da extração)
**Done when**: NFC-e continua verde após a extração; adaptador determinístico; `matchItems` intacto.
**Commit**: `feat(nl-list): adaptador de linha gerada e matching por casa reusável`

### T3: Rota /ai/generate-list — gate Pro + rate limit + erros
**What**: `apps/api/src/routes/ai.ts`: `POST /generate-list` (`.use(requireHousehold)` + `rateLimit({windowMs:60_000, max:10})`); zValidator (`prompt` 3–500 chars → 400 `prompt_too_short`/`prompt_too_long`; `listId?` uuid opcional só ecoa); **ordem**: gate Pro (`c.get('plan') !== 'pro' → 403 pro_required`) → env-gate (`!GEMINI_API_KEY → 501 ai_unavailable`) → `generateShoppingList` (1 retry se null por parse; falha persistente → 502 `ai_generation_failed`) → array vazio → 200 `{items:[], lines:[]}` → sucesso → adapta + `matchLinesForHousehold` → 200 `{items, lines}`; log seguro (`{promptLen, itemCount, status}`, nunca o prompt). Mount em `apps/api/src/index.ts` (`.route('/ai', aiRoute)`).
**Where**: `apps/api/src/routes/ai.ts` · `apps/api/src/index.ts` · `apps/api/src/test/ai-generate-list.test.ts`
**Depends**: T2 · **Requirement**: NL-02/NL-04 · **Tests**: integration (fetch do Gemini mockado): free→403 antes do fetch; pro happy→200 lines; sem chave→501; JSON inválido→retry→502; timeout→502; array vazio→200 []; prompt curto/longo→400; 11ª chamada/min→429
**Gate**: Build (fim de fase — inclui `pnpm typecheck` do monorepo) · **Commit**: `feat(nl-list): rota de geração com gate Pro, rate limit e erros tipados`

### T4: Client — serviço de geração + erros tipados
**What**: `apps/web/src/lib/nl-list.ts`: `generateNlList(prompt, listId?)` → POST `/ai/generate-list`; `NlListError(code)` (`ai_unavailable`, `ai_generation_failed`, `prompt_too_short`, `prompt_too_long`, `pro_required`) — `code` = chave `t('errors.<code>')`; `pro_required` sinalizado pro caller abrir paywall; devolve `{items: NlGeneratedItem[], lines: NlLine[]}` (espelha `MatchResult`). Molde de `lib/nfce-import.ts:66`.
**Where**: `apps/web/src/lib/nl-list.ts` + `apps/web/src/lib/nl-list.test.ts`
**Depends**: T3 · **Requirement**: NL-02/NL-04 · **Tests**: unit (fetch mock: erro→código traduzível; pro_required à parte; happy→items+lines) · **Gate**: Quick-web
**Commit**: `feat(web): serviço client de geração de lista por texto`

### T5: Client — revisão generalizada (sem preço/loja) [P]
**What**: (a) generalizar `apps/web/src/features/nfce/nfce-line-row.tsx`: props `showPrice?: boolean`, `showStore?: boolean` (**default true** → NFC-e intacto); com false, esconde os inputs de preço. (b) `apps/web/src/features/nl-list/nl-review.tsx` (`<200 linhas`): container — recebe `{prompt, target}` (`target = {kind:'new', name} | {kind:'existing', listId}`); roda `generateNlList`; renderiza linhas via `NfceLineRow` (`showPrice={false} showStore={false}`); aviso quando `lines.length===0`; `pro_required`→`PaywallSheet feature="nlList"`; confirmar→`confirmNlReview`. NÃO tocar `nfce-review.tsx`.
**Where**: `apps/web/src/features/nfce/nfce-line-row.tsx` (props), `apps/web/src/features/nl-list/nl-review.tsx` (novo)
**Depends**: T4 · **Requirement**: NL-05 · **Tests**: none (UI; typecheck garante que default não muda NFC-e) · **Gate**: Quick-web (typecheck)
**Commit**: `feat(web): tela de revisão de lista gerada (reusa linha do NFC-e)`

### T6: Client — confirm offline (lista nova / existente) [P]
**What**: `apps/web/src/db/nl-confirm.ts`: `confirmNlReview({target, lines})` — `target.kind==='new'` → `listId = await createList({name, isRecurring:false})`; senão `listId = target.listId`; por linha não-ignorada: `itemId = line.itemId ?? await createItem({name:line.newItemName||line.raw.name, unit, photoBlob:null, barcodes:[]})` (item ANTES da entrada) → `setListEntry(listId, itemId, line.qty)`. SEM preço, SEM loja. Molde de `nfce-confirm.ts:28`.
**Where**: `apps/web/src/db/nl-confirm.ts` + `apps/web/src/db/nl-confirm.test.ts`
**Depends**: T4 · **Requirement**: NL-03 · **Tests**: unit (fake-indexeddb): new→1 lista+N entradas; existing→N entradas na lista alvo; item repetido→upsert qty; linha "criar"→item antes da entrada; ignorada não grava
**Gate**: Quick-web · **Commit**: `feat(web): confirmação da lista gerada cria/preenche lista offline`

### T7: Client — entrada dupla (criação + lista existente)
**What**: (a) `apps/web/src/pages/listas-page.tsx` (`NewListSheet:104`): `<textarea>` opcional "descreva por texto"; se preenchido no submit → abre `NlReview target={kind:'new', name}` em vez de criar lista vazia; se vazio → caminho atual. (b) `apps/web/src/pages/lista-detail-page.tsx`: botão "Adicionar por texto" → sheet c/ textarea → `NlReview target={kind:'existing', listId}`.
**Where**: `apps/web/src/pages/listas-page.tsx`, `apps/web/src/pages/lista-detail-page.tsx`
**Depends**: T5, T6 · **Requirement**: NL-03 · **Tests**: none (UI) · **Gate**: Build (fim de fase — inclui `pnpm typecheck` do monorepo)
**Commit**: `feat(web): entrada por texto na criação de lista e em lista existente`

### T8: i18n — 6 locales
**What**: chaves `nlList.*` (botão/label do campo de texto, título revisão, aviso "sem itens", confirmar, placeholder) e `errors.*` novos (`ai_unavailable`, `ai_generation_failed`, `prompt_too_short`, `prompt_too_long`; `pro_required` e `rate_limited` já existem — reusar) + `billing.nlListPaywallPitch` em pt (fonte) + en/es/it/de/fr (placeholder inglês nos 5, tradução final aqui) — estrutura idêntica nos 6. `PaywallFeature` já ganhou `'nlList'` na T5.
**Where**: `apps/web/src/i18n/locales/{pt,en,es,it,de,fr}.ts`
**Depends**: T4-T7 · **Requirement**: NL-06 · **Tests**: none · **Gate**: Quick-web (typecheck pega chave faltando)
**Commit**: `feat(i18n): strings de lista por texto nos 6 idiomas`

### T9: Docs + env + STATE.md + tracker
**What**: (a) `apps/api/.env.example`: nota em `GEMINI_API_KEY` de que a MESMA chave liga o embedding do NFC-e **e** a geração de lista por texto (sem ela: matching por fuzzy no NFC-e / nl-list devolve 501); (b) `docs/setup-checklist-operacional.md`: acrescentar 1 linha na entrada do Gemini ("liga também a geração de lista por texto — Pro-only"); (c) `.specs/project/STATE.md`: linha de decisão 2026-07-06 (feature nl-list: Pro-only sem degustação, Gemini generateContent env-gated, rate limit 10/min, reuso do matching do NFC-e sem tocar assinatura); (d) marcar tasks done neste arquivo.
**Where**: `apps/api/.env.example`, `docs/setup-checklist-operacional.md`, `.specs/project/STATE.md`, este arquivo
**Depends**: T1-T8 · **Requirement**: NL-06 · **Tests**: none · **Gate**: Build final (inclui `pnpm typecheck` do monorepo)
**Commit**: `feat(nl-list): env de exemplo, checklist e registro de estado`

---

## Diagram-Definition Cross-Check

| Task | Depends (body) | Diagrama | Status |
|---|---|---|---|
| T1 | none | P1 início | ✅ |
| T2 | T1 | P1 | ✅ |
| T3 | T2 | P2 após P1 | ✅ |
| T4 | T3 | P2 fim | ✅ |
| T5 | T4 | P3 [P] | ✅ |
| T6 | T4 | P3 [P] | ✅ |
| T7 | T5,T6 | P3 fim | ✅ |
| T8 | T4-T7 | P4 | ✅ |
| T9 | T1-T8 | P4 último | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix exige | Task diz | Status |
|---|---|---|---|---|
| T1 | gemini client | unit (fetch mock) | unit | ✅ |
| T2 | adaptador/match | unit | unit | ✅ |
| T3 | rota/gate/rate | integration | integration | ✅ |
| T4 | client service | unit | unit | ✅ |
| T5 | UI revisão | none/typecheck | none | ✅ |
| T6 | confirm offline | unit | unit | ✅ |
| T7 | UI entradas | none | none | ✅ |
| T8/T9 | i18n/docs/env | none | none | ✅ |

## Status das tasks

- [ ] T1 · [ ] T2 · [ ] T3 · [ ] T4 · [ ] T5 · [ ] T6 · [ ] T7 · [ ] T8 · [ ] T9

**Status**: Ready for execution
