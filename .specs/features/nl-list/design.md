# Lista por linguagem natural — Design

**Spec**: `.specs/features/nl-list/spec.md`
**Context**: `.specs/features/nl-list/context.md`
**Status**: Draft (aguardando aprovação)
**Base**: reuso direto do pipeline de NFC-e (matching + embedding + cliente Gemini REST) — file:line citados abaixo são código real lido, não pesquisa.

---

## Abordagens consideradas (Medium → exploração das decisões não-óbvias)

### Como casar a linha gerada com o catálogo (reuso do matching)

| | Abordagem | Trade-off |
|---|---|---|
| **A (recomendada)** | **Adaptador `GeneratedLine → NfceItem-like`** e chamar `matchItems` como está | ✅ zero mudança na assinatura do NFC-e (verificado: `matchItems(itens, catalog, env)` só usa `item.descricao`); reuso total do fuzzy+embedding+cache. ❌ criar um `NfceItem` "de mentira" com preço 0 (campo não usado pelo matching) |
| B | Refatorar `matchItems` pra aceitar `{descricao}[]` (tipo mínimo `MatchableLine`) | ✅ semanticamente mais limpo. ❌ toca código NFC-e testado e estável (risco de regressão numa feature Pro já entregue) — viola "decisão verificada é sticky" |
| C | Duplicar a lógica de matching pro nl-list | ❌ DRY violado; 2 pipelines divergem no tempo |

**Escolha: A.** O `matchItems` (`matching.ts:142`) só lê `item.descricao` de cada `NfceItem` — o adaptador monta `{descricao: line.name, quantidade: line.qty, unidade: line.unit, valorUnitCents: 0, valorTotalCents: 0, ean: null}`. Sem tocar o NFC-e. Reusa `loadCatalog`/`embedAndCacheCatalog` (`embed-cache.ts`) idênticos.

### Tela de revisão (reusar nfce-review vs. duplicar)

| | Abordagem | Trade-off |
|---|---|---|
| **Generalizar (recomendado)** | `nfce-line-row` ganha props `showPrice`/`showStore` (default true); nl-list passa false | ✅ 1 componente de linha (troca de item, criar inline, ignorar, editar qty já existem); nl-list reaproveita o picker. ❌ o componente vira levemente parametrizado |
| Duplicar enxuto | `nl-review.tsx` + `nl-line-row.tsx` próprios | ✅ isolamento total. ❌ duplica o picker + o toggle ignorar + a edição de qty (≈150 linhas repetidas que divergem) |

**Escolha: generalizar a LINHA, container próprio.** `nfce-line-row.tsx` (`:33`) já tem tudo que a nl-list precisa (nome gerado, qty editável, trocar/criar/ignorar, `ItemPickerSheet`). Adicionar `showPrice`/`showStore` (bool, default true → NFC-e intacto). O **container** é próprio (`nl-review.tsx`) porque o fluxo difere: sem passo de loja, sem `price_records`, alvo = lista (nova/existente) via `confirmNlReview`. Não mexer no `nfce-review.tsx` (fluxo de preço/loja é dele).

### Provider de geração (structured output)

| | Abordagem | Trade-off |
|---|---|---|
| **Gemini generateContent + responseSchema (recomendado)** | fetch REST puro no molde do `embedding.ts` | ✅ mesma chave/env-gate/timeout já provados; structured output nativo (JSON garantido por schema); sem SDK. ❌ 1 método novo de rede |
| SDK `@google/genai` | dep nova | ❌ o projeto NÃO usa SDK (o `embedding.ts` é fetch puro por decisão) — não introduzir |
| Prompt "responda JSON" sem responseSchema | mais frágil | ❌ modelo às vezes embrulha em markdown/prosa; responseSchema elimina o parse frágil |

**Escolha: Gemini REST puro com `responseMimeType: application/json` + `responseSchema`**, no mesmo módulo-vizinho do `embedding.ts`. Modelo `gemini-2.0-flash` (rápido/barato; ajustável). Verificado: NÃO existe `generateContent`/`responseSchema` no repo hoje (`grep` vazio) — é código novo, mas segue o padrão exato do `embed`.

---

## Architecture Overview

```mermaid
graph TD
    A[Entrada a: NewListSheet campo texto] -->|prompt| SVC[lib/nl-list.ts]
    B[Entrada b: lista existente botão adicionar] -->|prompt + listId| SVC
    SVC -->|POST /ai/generate-list {prompt}| RT[routes/ai.ts<br/>requireHousehold + rateLimit 10/min]
    RT --> GATE{plan === pro?}
    GATE -->|free| E403[403 pro_required]
    GATE -->|pro| KEY{GEMINI_API_KEY?}
    KEY -->|não| E501[501 ai_unavailable]
    KEY -->|sim| GEN[nfce/gemini-generate.ts<br/>generateContent + responseSchema<br/>1 retry se JSON inválido]
    GEN -->|falha/timeout| E502[502 ai_generation_failed]
    GEN -->|array vazio| EMPTY[200 items:[]<br/>UI avisa sem itens]
    GEN -->|GeneratedLine[]| ADAPT[adaptador → NfceItem-like<br/>preço 0]
    ADAPT --> MATCH[matchItemsForHousehold<br/>loadCatalog + embedAndCacheCatalog + matchItems]
    MATCH -->|GEMINI_API_KEY?| EMB[(Gemini embed<br/>opcional, cache items.embedding)]
    MATCH -->|MatchResult[] + GeneratedLine[]| REV[client: nl-review.tsx<br/>matcheado/novo/ignorar, qty editável]
    REV -->|confirm alvo=lista nova| CL[createList + setListEntry]
    REV -->|confirm alvo=lista existente| SE[setListEntry na lista aberta]
    CL --> OUT[outbox → POST /shopping/lists + entries]
    SE --> OUT
```

**Rota stateless.** Diferente do NFC-e (que persiste `nfce_imports` pra cache/quota), a nl-list **não persiste nada server-side**: gera + casa + responde. A materialização (lista/itens/entradas) é do CLIENT via repositórios Dexie + outbox — padrão do projeto (todo write do client passa por Dexie+outbox; não há endpoint batch).

**Reuso do coração:** `matchItemsForHousehold` hoje é helper **privado** em `routes/nfce.ts:165`. Design: extrair pra `apps/api/src/nfce/match-for-household.ts` (mesma lógica: `loadCatalog` → `embedAndCacheCatalog` → `matchItems`) e importar nas duas rotas — sem duplicar. Alternativa (se extrair for arriscado): exportar do `nfce/index.ts`. **Extrair é o caminho** (função pura sobre o catálogo, sem acoplamento de rota).

---

## Code Reuse Analysis

| Existente | Local | Uso |
|---|---|---|
| Cliente Gemini REST env-gated | `apps/api/src/nfce/embedding.ts:36` (`embed` — fetch, `AbortSignal.timeout`, key-gate) | Molde EXATO do `generateContent`: mesmo endpoint base, mesmo padrão de erro-silencioso→null vira erro-tipado aqui |
| Matching híbrido | `apps/api/src/nfce/matching.ts:142` (`matchItems(itens, catalog, env)` → `MatchResult[]`) | Reusar sem tocar; só lê `item.descricao` (verificado) → adaptador monta `NfceItem` c/ preço 0 |
| Carga + cache de catálogo | `apps/api/src/nfce/embed-cache.ts:37,86` (`embedAndCacheCatalog`/`loadCatalog`) | Reuso idêntico; embedding do catálogo cacheado em `items.embedding` (já existe da migração 0027 do NFC-e) |
| Pipeline por casa | `apps/api/src/routes/nfce.ts:165` (`matchItemsForHousehold`, hoje privado) | **Extrair** pra `nfce/match-for-household.ts` e reusar nas 2 rotas |
| Log seguro | `apps/api/src/nfce/nfce-log.ts:36` (`logNfceLookup` — mascara chave) | Molde do log de geração (`{householdId parcial, promptLen, itemCount, status}` — nunca prompt cru) |
| Gate Pro no request | `apps/api/src/routes/uploads.ts:29` (`c.get('plan') !== 'pro' → 403 pro_required`) | Copiar literalmente no início da rota, ANTES do fetch |
| Rate limit IP | `apps/api/src/middleware/rate-limit.ts:11`; uso `routes/households.ts:283` (`rateLimit({windowMs:60_000, max:...})`) | `rateLimit({windowMs:60_000, max:10})` no `.post('/generate-list', ...)` |
| Plano efetivo | `apps/api/src/middleware/household.ts` (`resolveEffectivePlan`→`c.get('plan')`) | Gate lê `c.get('plan')` |
| Rota household-scoped | `apps/api/src/routes/nfce.ts:73` (`.use(requireHousehold)`, mount em `index.ts`) | Molde de `routes/ai.ts`; household vem da sessão, nunca do body |
| Linha de revisão editável | `apps/web/src/features/nfce/nfce-line-row.tsx:33` (nome+qty+trocar/criar/ignorar+`ItemPickerSheet`) | Generalizar c/ `showPrice`/`showStore` (default true → NFC-e intacto); nl-list passa false |
| Erro tipado no client | `apps/web/src/lib/nfce-import.ts:66` (`NfceImportError` → `t('errors.<code>')`) | Molde de `NlListError` (`ai_unavailable`, `ai_generation_failed`, `prompt_*`, `pro_required`) |
| PaywallSheet + union | `apps/web/src/features/billing/paywall-sheet.tsx:7` (`PaywallFeature`) | `PaywallFeature` ganha `'nlList'` + pitch `billing.nlListPaywallPitch` |
| Criar lista avulsa | `apps/web/src/pages/listas-page.tsx:104` (`NewListSheet`), `repositories.ts:396` (`createList`) | Entrada (a): campo de texto opcional no sheet; confirm chama `createList` + `setListEntry` |
| Lista existente + entradas | `apps/web/src/pages/lista-detail-page.tsx`, `repositories.ts:453` (`setListEntry` upsert) | Entrada (b): botão "adicionar por texto"; confirm chama `setListEntry` na lista aberta |
| Criar item opt-in | `apps/web/src/db/repositories.ts:46` (`createItem(NewItemInput)`) | Linha "criar" → `createItem({name, unit, ...})` antes da entrada |
| Confirm offline (molde) | `apps/web/src/db/nfce-confirm.ts:28` (`confirmNfceReview` — item antes do vínculo) | Molde de `confirmNlReview` (item novo antes da entrada; sem preço/loja) |
| Harness pglite / fake-idb | `apps/api/src/test/*`, `apps/web` vitest.setup | Integration da rota (Gemini via fetch mock) + confirm no client |

---

## Components

### 1. `apps/api/src/nfce/gemini-generate.ts` (novo — geração via Gemini REST, env-gated)
- `generateShoppingList(prompt: string, env?): Promise<GeneratedLine[] | null>` — POST em `…/models/gemini-2.0-flash:generateContent?key=…` com `generationConfig: { responseMimeType: 'application/json', responseSchema: {...array de {name, qty, unit}...} }`; `AbortSignal.timeout`; **retorna null** quando sem `GEMINI_API_KEY` (caller vira 501) OU quando a chamada/parse falha (caller decide retry→502). Molde do `embedding.ts:36`.
- `GeneratedLine = { name: string; qty: number; unit: string }` — saída validada por zod antes de retornar (descarta linhas sem `name`).
- Prompt-engineering: system instruction curta ("você monta listas de compras de supermercado; devolva itens genéricos com quantidade e unidade; responda no idioma do prompt do usuário; não invente marcas"). O `responseSchema` garante o shape; o zod é a rede de segurança.
- `<200 linhas`.

### 2. `apps/api/src/nfce/match-for-household.ts` (novo — extração do helper privado)
- `matchLinesForHousehold(householdId, lines: {descricao: string; quantidade: number; unidade: string; ...}[]): Promise<MatchResult[]>` — move a lógica de `routes/nfce.ts:165` (`loadCatalog` → `embedAndCacheCatalog` → `matchItems`). `routes/nfce.ts` passa a importar daqui (sem duplicar).
- `generatedToNfceItem(line: GeneratedLine): NfceItem` — adaptador: `{descricao: line.name, quantidade: line.qty, unidade: normalizeUnit(line.unit), valorUnitCents: 0, valorTotalCents: 0, ean: null}`. `normalizeUnit` mapeia a string do modelo pro enum `Unit` do app (default `'un'`).

### 3. `apps/api/src/routes/ai.ts` (novo) — household-scoped
- `POST /ai/generate-list` — `.use(requireHousehold)` + `rateLimit({windowMs:60_000, max:10})`; zValidator (`prompt` 3–500 chars → 400 `prompt_too_short`/`prompt_too_long`; `listId?` uuid opcional só ecoa pro client, não usado server-side); **gate Pro primeiro** (`c.get('plan') !== 'pro' → 403 pro_required`, ANTES do Gemini); **env-gate** (`!GEMINI_API_KEY → 501 ai_unavailable`); chama `generateShoppingList` (1 retry se null por parse); falha persistente → `502 ai_generation_failed`; array vazio → `200 { items: [], lines: [] }`; sucesso → adapta + `matchLinesForHousehold` → `200 { items: GeneratedLine[], lines: MatchResult[] }`; log seguro (`{promptLen, itemCount, status}`, nunca o prompt).
- Mount em `apps/api/src/index.ts` (`.route('/ai', aiRoute)`, no mesmo bloco das outras rotas household-scoped).

### 4. Client (`apps/web`)
- **`lib/nl-list.ts`**: `generateNlList(prompt, listId?): Promise<NlGenerateResult>` — POST `/ai/generate-list`; mapeia erros tipados → `NlListError(code)` (`ai_unavailable`, `ai_generation_failed`, `prompt_too_short`, `prompt_too_long`, `pro_required`); devolve `{ items: NlGeneratedItem[], lines: NlLine[] }` (espelha `MatchResult`). `pro_required` tratado à parte pelo caller (paywall).
- **`features/nl-list/nl-review.tsx`** (`<200 linhas`): container da revisão. Recebe `{ prompt, target }` onde `target = {kind:'new', name} | {kind:'existing', listId}`; roda `generateNlList`; renderiza linhas via `NfceLineRow` (com `showPrice={false} showStore={false}`); aviso quando `lines.length === 0`; confirmar → `confirmNlReview`. Paywall quando `pro_required`.
- **`db/nl-confirm.ts`**: `confirmNlReview({target, lines})` — se `target.kind==='new'`: `const listId = await createList({name, isRecurring:false})`; depois por linha não-ignorada: `itemId = line.itemId ?? await createItem({name, unit, ...})` → `setListEntry(listId, itemId, qty)`. Se `existing`: mesmo laço na `target.listId`. Ordem: item novo ANTES da entrada (molde `nfce-confirm.ts:28`). Sem preço, sem loja.
- **Entrada (a)** — `pages/listas-page.tsx` (`NewListSheet:104`): adicionar campo `<textarea>` opcional "descreva por texto (opcional)"; se preenchido no submit → abre `NlReview` com `target={kind:'new', name}` em vez de criar lista vazia direto.
- **Entrada (b)** — `pages/lista-detail-page.tsx`: botão "Adicionar por texto" → sheet com textarea → `NlReview` com `target={kind:'existing', listId}`.
- **Generalizar** `features/nfce/nfce-line-row.tsx`: props `showPrice?: boolean` e `showStore?: boolean` (default true); nl-list passa false (esconde os inputs de preço; o passo de loja é do container, então nl-review simplesmente não renderiza `NfceStoreStep`).
- **Gate no client**: botões visíveis a todos; `pro_required` do servidor → `PaywallSheet feature="nlList"`.
- i18n: `nlList.*` + `errors.*` novos nos **6 locales**.

---

## Error Handling Strategy

| Cenário | Tratamento | Usuário vê |
|---|---|---|
| Free chama a rota | `403 pro_required` ANTES do Gemini | `PaywallSheet` (feature nlList) |
| Rate limit estourado (mesmo Pro) | `429 rate_limited` antes do Gemini | "muitas gerações, aguarde um instante" (`errors.rate_limited`) |
| `GEMINI_API_KEY` ausente | `501 ai_unavailable` | "geração por texto indisponível" |
| Prompt <3 / >500 chars | `400 prompt_too_short` / `prompt_too_long` (zod) | mensagem de tamanho |
| JSON inválido do modelo | 1 retry; falhando → `502 ai_generation_failed` | "não consegui gerar agora, tente de novo" |
| Timeout do Gemini | abort → `502 ai_generation_failed` | idem |
| Array vazio / sem itens | `200 { items: [] }` (não é erro) | revisão vazia + aviso "não entendi itens nesse texto" |
| Catálogo vazio | tudo "novo" | revisão com criar-tudo |
| Idioma fora dos 6 | gera mesmo assim | resultado normal (pode ter mais "novo") |
| Unidade não-canônica do modelo | `normalizeUnit → 'un'` | qty preservada, unidade default |

**Handler nunca vaza o prompt cru nem o catálogo nos logs**: log só `{householdId parcial, promptLen, itemCount, status, tokens?}`. O Gemini recebe SÓ o prompt do usuário + (implicitamente, via matching pós-geração) o catálogo da PRÓPRIA casa — nunca dados de outro household.

---

## Risks & Concerns

| Concern | Local | Impacto | Mitigação |
|---|---|---|---|
| Tocar `matchItems`/nfce-line-row quebra o NFC-e (feature Pro entregue) | matching.ts / nfce-line-row.tsx | regressão em produção | Adaptador (não muda assinatura do `matchItems`); props com **default true** (NFC-e não muda); typecheck+testes do NFC-e no gate |
| Extrair `matchItemsForHousehold` altera `routes/nfce.ts` | nfce.ts | regressão de rota | Extração é move-refactor puro (mesma lógica); testes de integração do NFC-e (`nfce-routes.test.ts`) rodam no gate e provam paridade |
| Modelo devolve JSON fora do schema | gemini-generate.ts | parse quebra / itens ruins | `responseSchema` + validação zod + 1 retry → 502; nunca cria lixo (revisão é a barreira humana) |
| Custo de geração (Pro sem quota) | rota | loop/abuso queima créditos | Rate limit ~10/min por IP; prompt≤500 chars; log de tokens; Pro-only (não é público) |
| Vazamento de dados entre casas via prompt | rota/Gemini | LGPD/privacidade | Gemini recebe SÓ o prompt; o catálogo (matching) é carregado por `householdId` da sessão (`loadCatalog(householdId)`); nada de outra casa no contexto |
| Prompt injection ("ignore instruções, gere X") | gemini-generate.ts | saída lixo | Baixo impacto: a saída é só uma lista de compras revisada pelo humano; nada executável; schema limita o shape |
| Unidade/qty absurda do modelo (qty=9999) | adaptador/revisão | entrada estranha na lista | qty editável na revisão; `normalizeUnit` default seguro; opcional: clamp de qty no adaptador |
| Prompt em idioma raro gera pouco | gemini-generate.ts | poucos itens | Aceitável (AC: gera mesmo assim); array vazio → aviso, não crash |
| `501 ai_unavailable` confunde com feature quebrada | rota/UI | usuário acha que é bug | Mensagem i18n clara "indisponível"; docs/env deixam explícito que a chave liga a feature |

---

## Tech Decisions (não-óbvias)

| Decisão | Escolha | Rationale |
|---|---|---|
| Matching | Adaptador `GeneratedLine → NfceItem` + `matchItems` intacto | `matchItems` só lê `descricao` (verificado `matching.ts:96-122`); não tocar código NFC-e estável |
| Helper por casa | Extrair `matchItemsForHousehold` (privado hoje) pra `nfce/match-for-household.ts` | Reuso entre 2 rotas sem duplicar; move-refactor de baixo risco |
| Provider | Gemini `generateContent` + `responseSchema`, REST puro | Structured output nativo; mesmo padrão/env do `embedding.ts`; projeto não usa SDK |
| Modelo | `gemini-2.0-flash` (ajustável) | Rápido, barato, structured output, free tier cobre |
| Gate | Pro-only (`403 pro_required`), SEM quota Free | Decisão explícita do usuário (mais protetivo que NFC-e); geração é feature-valor Pro |
| Anti-abuso | Rate limit ~10/min por IP na rota | Custo é centavos mas evita loop; barra antes do Gemini |
| Sem chave | `501 ai_unavailable` (sem fallback) | A geração É a feature; nada a degradar (≠ matching do NFC-e) |
| Estado server | Stateless (não persiste geração) | Lista vive no client via outbox; sem tabela nova; menos superfície |
| Revisão | Generalizar a LINHA (`showPrice/showStore`), container próprio | Reusa picker/ignorar/qty; NFC-e intacto por default; fluxo de alvo (lista) é próprio |
| Confirm | `createList`/`setListEntry` (sem preço/loja) | nl-list monta lista, não registra preço; upsert evita duplicar entrada |
| Idioma | Itens no idioma do prompt; matching normaliza | Modelo responde na língua; `normalizeDescription` já tira acento/caixa |
| Retry | 1 retry só em JSON inválido → 502 | Robustez barata; não retry infinito (custo) |

---

## Unresolved questions
1. Modelo exato do Gemini (`gemini-2.0-flash` vs. flash GA vigente na implementação) e limites do free tier de `generateContent` — confirmar no AI Studio; folga grande pro volume (rate limit 10/min).
2. `responseSchema` exato (campos `name/qty/unit`; incluir `category`/`aisle` opcional pro modelo agrupar?) — MVP fica em `{name, qty, unit}`; enriquecer depois se útil.
3. Clamp de qty no adaptador (limite superior pra qty absurda do modelo) — provável sim (ex. ≤999), mas a revisão editável já cobre; decidir na implementação.
4. Extrair `matchItemsForHousehold` para módulo próprio vs. exportar do `nfce/index.ts` — recomendado extrair (função pura); confirmar que o barrel `nfce/index.ts` não puxa `db` indevidamente pros testes unitários (nota já existe em `index.ts:17-21`).
5. Registrar tokens no log exige a resposta `usageMetadata` do `generateContent` — incluir se o endpoint retornar; senão só `promptLen`+`itemCount`.
