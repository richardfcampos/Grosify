# Validation — nl-list (lista por linguagem natural)

**Verifier:** independente (autor ≠ verificador). Evidência-ou-zero + sensor de mutação.
**Escopo:** commits `dd27557^..HEAD` (a510007) — T1–T9 + teste extra do 429 (633e55d).
**Range:** `git log --oneline dd27557^..HEAD` = 11 commits (1 docs de spec + 10 de código/teste).
**Veredito:** **PASS ✅**

---

## Gate (contagens exatas)

| Passo | Comando | Resultado |
|---|---|---|
| UI build | `pnpm --filter @grosify/ui build` | ✅ built (ui.css 3.94kB, index.es.js 3.29kB) |
| Typecheck | `pnpm typecheck` | ✅ 6/6 tasks, 0 erros (FULL TURBO) |
| API tests | `pnpm --filter @grosify/api test` | ✅ **302 passed** / 24 files, 0 failed |
| Web tests | `pnpm --filter @grosify/web test` | ✅ **34 passed** / 7 files, 0 failed |

Contagens batem com o esperado (~302 api / ~34 web).

---

## Cobertura ancorada no spec (28 ACs + 11 edge cases)

### P1 — Gerar lista por texto (NL-01/NL-02)

| AC | Evidência | Outcome |
|---|---|---|
| P1.1 Pro + prompt 3–500 → Gemini structured output → `{name,qty,unit}` | `gemini-generate.ts:123-153` (fetch + responseSchema); `gemini-generate.test.ts:28-40` | ✅ JSON válido → `GeneratedLine[]` alinhado |
| P1.2 casa contra catálogo via `matchItems` → `MatchResult[]` 1:1 | `match-for-household.ts:24-31`; `ai.ts:90-92`; `ai-generate-list.test.ts:137-159` (`lines[0].itemId===arrozId`, `lines[1].itemId===null`) | ✅ casa "Arroz", "Guardanapo" novo |
| P1.3 revisão classifica matcheado/novo, qty editável, nome novo pré-preenchido | `nl-review.tsx:116-129` (`newItemName: line.itemId ? '' : line.suggestedName`); `nfce-line-row.tsx:86-93` (input editável) | ✅ inspeção — pré-preenche pelo suggestedName |
| P1.4 confirm materializa: matcheado→entry; "criar"→item antes; ignorado→fora | `nl-confirm.ts:38-41` (createItem ANTES de setListEntry); `nl-confirm.test.ts:43-64,154-170` | ✅ item criado antes; entry referencia item novo |
| P1.5 lista vazia → revisão vazia + aviso, sem criar nada | `ai.ts:86` (200 `{items:[],lines:[]}`); `nl-review.tsx:156-158` (`noItemsWarning`); `ai-generate-list.test.ts:171-178` | ✅ 200 `[]` + `nlList.noItemsWarning` |
| P1.6 catálogo vazio → tudo "novo", fluxo funciona | `ai-generate-list.test.ts:161-169` (`every itemId===null`); `match-for-household.test.ts:115-124` | ✅ todas as linhas null |

### P1 — Entrada dupla (NL-03)

| AC | Evidência | Outcome |
|---|---|---|
| P2.1 campo texto na criação avulsa → cria lista + entries | `listas-page.tsx:128-135,156-159` (nlPrompt → `NlReview target=new`); `nl-confirm.test.ts:43-64` | ✅ cria 1 lista + N entries |
| P2.2 "adicionar por texto" em lista existente → adiciona sem criar lista | `lista-detail-page.tsx` diff (`AddByTextSheet` → `target=existing`); `nl-confirm.test.ts:66-96` | ✅ N entries, nenhuma lista nova |
| P2.3 item já existente na lista → `setListEntry` upsert (não duplica) | `nl-confirm.ts:40`; `nl-confirm.test.ts:98-152` (1 entry, qty=4) | ✅ upsert de qty |
| P2.4 sem texto na criação → caminho atual (vazia), sem Gemini | `listas-page.tsx:132-153` (só chama `createList` se `!nlPrompt.trim()`) | ✅ inspeção — nlPrompt vazio pula NlReview |

### P1 — Gate Pro-only (NL-02)

| AC | Evidência | Outcome |
|---|---|---|
| P3.1 Free → 403 `pro_required` ANTES do Gemini; client abre PaywallSheet(`nlList`) | `ai.ts:62`; `ai-generate-list.test.ts:192-200` (spy 0 chamadas); `nl-review.tsx:45-47,61-63`; `paywall-sheet.tsx` (`nlList` feature) | ✅ 403 + 0 chamadas Gemini + paywall |
| P3.2 Pro → prossegue | `ai-generate-list.test.ts:137-159` (200) | ✅ 200 |
| P3.3 >10/min (mesmo Pro) → 429 antes do Gemini | `ai.ts:48` (rateLimit 10/60s); `ai-generate-list.test.ts:256-274` | ✅ 11ª → 429 |
| P3.4 gate reprova → nenhuma chamada externa | `ai-generate-list.test.ts:199,221,241,251` (spy 0 em free/no-key/curto/longo) | ✅ spy prova 0 chamadas |
| P3.5 sem quota Free (só gate + rate limit) | `ai.ts` — sem contador de negócio (contraste com nfce) | ✅ inspeção — nenhum counter |

### P2 — Robustez (NL-04)

| AC | Evidência | Outcome |
|---|---|---|
| P4.1 sem `GEMINI_API_KEY` → 501 `ai_unavailable` | `ai.ts:66`; `ai-generate-list.test.ts:213-222` (501, spy 0) | ✅ 501 sem tocar Gemini |
| P4.2 JSON inválido → 1 retry → 502 | `ai.ts:73-75`; `ai-generate-list.test.ts:224-232` (spy 2 chamadas) | ✅ 502 após 2 tentativas |
| P4.3 array vazio pós-zod → 200 `items:[]` + aviso | `ai.ts:86`; `gemini-generate.test.ts:42-46` | ✅ 200 `[]` |
| P4.4 <3/>500 chars → 400 `prompt_too_short`/`prompt_too_long` | `ai.ts:35,49-58`; `ai-generate-list.test.ts:234-252` | ✅ 400 tipado, spy 0 |
| P4.5 timeout → 502 (não pendura) | `gemini-generate.ts:144` (`AbortSignal.timeout` 15s → null); `gemini-generate.test.ts:73-81` | ✅ null → 502 |
| P4.6 idioma fora dos 6 → gera mesmo assim (nunca 400 por idioma) | `ai.ts:35` (zod só valida tamanho, não idioma); `gemini-generate.ts:40-43` (system: idioma do prompt) | ✅ inspeção — sem check de idioma |

### P2 — Revisão editável reusada (NL-05)

| AC | Evidência | Outcome |
|---|---|---|
| P5.1 cada linha mostra gerado + match sugerido + trocar/criar/ignorar | `nfce-line-row.tsx:44-149` (reusado); `nl-review.tsx:164-173` | ✅ inspeção — reusa NfceLineRow |
| P5.2 trocar match: picker do nfce-line-row OU criar inline pré-preenchido | `nfce-line-row.tsx:134-147,152-211` (ItemPickerSheet) | ✅ inspeção |
| P5.3 confirm: só não-ignoradas viram entry; "criar" cria item; SEM loja/preço | `nl-review.tsx:141-149`; `nl-confirm.ts` (sem price_records) | ✅ inspeção — sem preço/loja |
| P5.4 modo nl-list esconde preço unitário e passo de loja | `nl-review.tsx:169-170` (`showPrice={false} showStore={false}`); `nfce-line-row.tsx:112,115-129` (input preço só se `showPrice`) | ✅ inspeção — preço oculto |
| P5.5 strings da tela nos 6 idiomas (`nlList.*`) | 6 locales × 10 sub-keys idênticas (pt/en/es/it/de/fr) | ✅ 6/6 estrutura completa |

### Edge cases (11)

| Edge | Evidência | Outcome |
|---|---|---|
| <3/>500 chars → 400 sem Gemini | `ai-generate-list.test.ts:234-252` | ✅ killed por mutação implícita |
| sem chave → 501 sem fetch | `ai-generate-list.test.ts:213-222`; `gemini-generate.test.ts:50-56` | ✅ |
| JSON inválido → retry → 502 | `ai-generate-list.test.ts:224-232` | ✅ |
| array vazio → 200 `[]` + aviso | `gemini-generate.test.ts:42-46`; `nl-review.tsx:156-158` | ✅ |
| catálogo vazio → tudo novo | `match-for-household.test.ts:115-124` | ✅ |
| idioma fora dos 6 → gera | `ai.ts:35` (só valida tamanho) | ✅ inspeção |
| Free → 403 antes do Gemini | `ai-generate-list.test.ts:192-200` | ✅ |
| rate limit (mesmo Pro) → 429 antes | `ai-generate-list.test.ts:256-274` | ✅ |
| colisão de nome → passa pela revisão, nunca duplica silencioso | `nl-review.tsx` (usuário decide); `nl-confirm.ts:40` (setListEntry upsert) | ✅ inspeção |
| unidade fora do enum → 'un' | `match-for-household.ts:58-61`; `match-for-household.test.ts:92-97`; `nl-confirm.test.ts:184-194` | ✅ |
| prompt exfiltra outra casa → só catálogo da própria casa no contexto | `ai.ts:68,91` (`householdId` da sessão, `matchLinesForHousehold(householdId,...)`); Gemini recebe só `prompt` (`gemini-generate.ts:138`) — catálogo NÃO vai pro prompt, só pro matching local | ✅ inspeção — sem dados cross-household |

**Cobertura: 28/28 ACs cobertos (17 por teste ancorado, 11 por inspeção UI/estrutura). 11/11 edge cases. 0 gaps.**

Privacidade/observabilidade: `ai.ts:79-83` loga só `{household(6 chars), lineCount, promptLen}` — NUNCA o prompt cru nem o catálogo. ✅ (Cost/Privacy do sweep confirmados.)

---

## Sensor de mutação (6 rodadas, 1 por vez, restaurado com `git checkout`)

| # | Mutação | Arquivo | Teste que pegou | Resultado |
|---|---|---|---|---|
| a | remover gate Pro (`plan!=='pro'`) | `ai.ts:62` | `free → 403` + `429 rate limit` (2 fail: 403→502) | **KILLED** |
| b | remover retry (1 chamada) | `ai.ts:73-74` | `spy prova 2 chamadas` (esperado 2, got 1) | **KILLED** |
| c | remover clamp de qty (`<=MAX_QTY`) | `gemini-generate.ts:81` | `qty >999 → clamp 1` (9999 vazou) | **KILLED** |
| d | mover rateLimit p/ DEPOIS do gate Pro | `ai.ts:46-48` | `11ª → 429` (free não consumiu bucket: 403 em vez de 429) | **KILLED** |
| e | confirm "novo" grava entry SEM criar item | `nl-confirm.ts:39` | `criar cria item ANTES` (0 items, 3 fail) | **KILLED** |
| f | zod aceita linha sem name (`name` optional) | `gemini-generate.ts:74` | `linha sem name → descartada` (empty-name vazou) | **KILLED** |

**6 mutações, 6 killed, 0 survived.** A suíte tem sensibilidade nos pontos críticos de correção do spec (gate, retry, clamp, ordem de gates, ordem create-item-then-entry, filtro de lixo do zod).

---

## NFC-e intacto pós-refactor (T2 — move-refactor do matching)

**Sim — verificado.**

- **Move-refactor puro:** `matchItemsForHousehold` (helper privado de `routes/nfce.ts`) → `matchLinesForHousehold` em `nfce/match-for-household.ts`. Diff mostra corpo IDÊNTICO (`loadCatalog` → `embedAndCacheCatalog` → `matchItems`), só renomeado e movido. `routes/nfce.ts` passou a importar do novo módulo e chama nos 2 caminhos (cache `:97` e lookup fresco `:128`).
- **Suíte NFC-e verde:** `pnpm --filter @grosify/api test nfce` → **12 files / 152 tests, 0 failed**.
- **`nfce-line-row` defaults preservados:** `showPrice = true` default (`nfce-line-row.tsx:39`) e `showStore?` reservado com default true (`:29`, não usado no render); o caminho NFC-e não passa nenhum → render do NFC-e (preço unitário + qty) inalterado. nl-list passa ambos `false` para esconder preço.

---

## Range / árvore

- **Range validado:** `dd27557^..HEAD` (a510007) — 11 commits.
- **`git status --short` final:** limpo exceto este `validation.md`. Todas as 6 mutações restauradas com `git checkout`; nenhum arquivo de produção alterado.

## Ranked gaps

Nenhum gap de correção. Observações menores (não bloqueiam):

1. **i18n incompleto (tradução, não estrutura):** `nlListPaywallPitch` está em inglês em es/it/de/fr; `rate_limited`/`ai_*`/`prompt_*` do `fr` também em inglês. As CHAVES existem nos 6 (nenhum crash de missing-key), mas o texto não está localizado — degrada UX, não funcionalidade. Fora do escopo estrito de "6/6 keys presentes" (que passa).
2. **`showStore` é prop reservada não-funcional:** `nfce-line-row.tsx:29` declara `showStore?` mas o componente não tem passo de loja para esconder (o "passo de loja" do NFC-e vive em outro componente). Inofensivo — é placeholder para simetria com o spec P5.4; nl-list passa `false` sem efeito. Não é bug.

## Unresolved questions

Nenhuma. Todos os ACs verificáveis foram ancorados; os de UI (sem harness de render) por inspeção de componente + condição + i18n.
