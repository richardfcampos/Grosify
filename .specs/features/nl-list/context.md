# Lista por linguagem natural — Context

**Gathered:** 2026-07-06
**Spec:** `.specs/features/nl-list/spec.md`
**Status:** Ready for design

## Feature Boundary

O usuário descreve uma compra em texto livre ("churrasco pra 10 pessoas", "café da manhã da semana pra 2") em qualquer um dos 6 idiomas do app. O servidor manda o prompt pro Gemini (structured output JSON), recebe uma lista de itens+quantidades, casa cada item com o catálogo da casa **reusando o pipeline de matching do NFC-e** (fuzzy + embedding opcional), e o usuário revisa numa tela editável (matcheado/novo/ignorar, qty editável — mesmo padrão do `nfce-review`) antes de confirmar. Confirmar cria uma **lista avulsa nova** OU **adiciona à uma lista existente**, via repositórios Dexie + outbox (offline-first). Feature **Pro-only** (sem degustação).

**A geração É a feature.** Sem `GEMINI_API_KEY` não há fallback — a rota devolve `501 ai_unavailable` (diferente do NFC-e, onde o matching degrada pra fuzzy; aqui não há o que gerar sem o modelo).

## Implementation Decisions (travadas pelo usuário)

### Entrada DUPLA (user escolheu as duas)
- **(a)** Campo de texto **opcional** na criação de lista avulsa (`NewListSheet` em `listas-page.tsx:104`): usuário digita o nome + opcionalmente descreve por texto → gera itens antes de criar a lista.
- **(b)** Botão **"adicionar por texto"** dentro de uma lista existente (`lista-detail-page.tsx`): gera itens e adiciona à lista aberta.
- Os dois caminhos convergem na MESMA tela de revisão; só o alvo do confirm muda (lista nova vs. lista existente).

### Gate: PRO-ONLY (user escolheu — mais protetivo que o NFC-e, por decisão explícita)
- **Free → `403 pro_required`** direto. **SEM quota de degustação** (o NFC-e dá 2/mês pra free; aqui não). Decisão consciente do usuário: geração por LLM é a feature-valor Pro, sem teaser.
- **Pro → liberado.** Anti-abuso via **rate limit** (não quota de negócio): ~10 gerações/min por IP na rota (`middleware/rate-limit.ts`), mesmo sendo Pro — custo por geração é centavos, mas evita loop/abuso.

### Itens novos: revisão antes de criar (user escolheu)
- Tela de revisão obrigatória (reusa o padrão `nfce-review`): cada linha vem classificada matcheado/novo/ignorar; qty editável; item novo é **opt-in por linha** (só cria se o usuário confirmar). Nunca cria item/lista sem passar pela revisão.

### Provider: Gemini env-gated (user escolheu)
- Geração via **Gemini** (`generateContent` com `responseSchema` JSON — structured output). Env-gated por `GEMINI_API_KEY` (a MESMA chave do embedding do NFC-e).
- **Sem chave → `501 ai_unavailable`.** AQUI NÃO há fallback fuzzy: a geração é o núcleo da feature.

### Idiomas (user escolheu)
- Prompt do usuário em **qualquer um dos 6 idiomas** do app (pt, en, es, it, de, fr).
- Itens gerados **no idioma do prompt** (o modelo responde na língua da entrada). O matching normaliza (uppercase/sem acento) então casa razoável cross-idioma; item novo herda o texto gerado.

### Reuso obrigatório (contratos reais lidos)
- **Matching:** `apps/api/src/nfce/matching.ts` (`matchItems(itens, catalog, env)` → `MatchResult[]`) + `apps/api/src/nfce/embed-cache.ts` (`loadCatalog`/`embedAndCacheCatalog`). O matching é o MESMO. A linha gerada precisa virar um `NfceItem`-like `{descricao, quantidade, unidade, valorUnitCents, valorTotalCents, ean, ncm}` — mas SEM preço (a geração não tem valores). Ver design (decisão: tipo próprio `GeneratedLine {name, qty, unit}` + adaptador pra `matchItems`, não forçar campos de preço fake).
- **Cliente Gemini:** `apps/api/src/nfce/embedding.ts` — REST puro (fetch, sem SDK), env-gate `GEMINI_API_KEY`, `AbortSignal.timeout`. A geração de texto adiciona um método novo NO MESMO padrão/módulo-vizinho (`generateContent` com `responseMimeType: application/json` + `responseSchema`).
- **Revisão:** `apps/web/src/features/nfce/{nfce-review,nfce-line-row,nfce-store-step}.tsx` — o design avalia generalizar vs. duplicar enxuto (recomendação no design).
- **Confirm offline:** `apps/web/src/db/repositories.ts` — `createList(NewListInput)`, `setListEntry(listId, itemId, qty)`, `createItem(NewItemInput)`. Sem preço/loja (a nl-list não registra `price_records`; só cria/preenche lista).
- **Gate Pro:** `c.get('plan') !== 'pro' → 403 pro_required` (molde `routes/uploads.ts:29`) + `PaywallSheet` (`features/billing/paywall-sheet.tsx`, `PaywallFeature` ganha `'nlList'`).
- **Rate limit:** `middleware/rate-limit.ts` (`rateLimit({windowMs, max})`, IP-based, molde `households.ts:283`).

### Agent's Discretion
- Modelo exato do Gemini (`gemini-2.0-flash` ou o flash GA vigente) e shape do `responseSchema`.
- Se `matchItems` é chamado com um adaptador `GeneratedLine → NfceItem` (preço 0) ou se o matching ganha um overload/tipo `MatchableLine {descricao}` — design decide (recomendado: adaptador enxuto, não tocar assinatura do NFC-e).
- Generalizar `nfce-review`/`nfce-line-row` (props pra esconder preço/loja) vs. duplicar `nl-review` enxuto.
- UX fina do campo de texto (inline no NewListSheet vs. sheet dedicado).
- Se a rota persiste alguma coisa server-side (recomendado NÃO: stateless, só gera+casa; a lista vive no client via outbox).

### Declined / Undiscussed Gray Areas → Assumptions (logadas no spec)
- Persistência server-side das gerações (histórico/analytics de prompt) — fora do MVP; a rota é stateless.
- Quota de degustação Free — **explicitamente recusada** pelo usuário (Pro-only puro).
- Preço/loja na revisão — a nl-list NÃO registra preços (diferente do NFC-e); a revisão só monta a lista.
- Streaming da resposta do Gemith — YAGNI; uma chamada, JSON completo.

## Specific References
- Matching reusado: `apps/api/src/nfce/matching.ts:142` (`matchItems`), `apps/api/src/nfce/embed-cache.ts:37,86` (`embedAndCacheCatalog`/`loadCatalog`)
- Cliente Gemini REST: `apps/api/src/nfce/embedding.ts:36` (`embed` — molde do fetch env-gated)
- Pipeline de matching por casa: `apps/api/src/routes/nfce.ts:165` (`matchItemsForHousehold` — helper privado; ver design pra extrair/reusar)
- Gate Pro: `apps/api/src/routes/uploads.ts:29` (`c.get('plan') !== 'pro' → 403 pro_required`)
- Rate limit: `apps/api/src/middleware/rate-limit.ts:11`, uso em `apps/api/src/routes/households.ts:283`
- PaywallSheet + feature union: `apps/web/src/features/billing/paywall-sheet.tsx:7` (`PaywallFeature`)
- Revisão a reusar/generalizar: `apps/web/src/features/nfce/nfce-review.tsx:100`, `nfce-line-row.tsx:33`
- Criação de lista avulsa (entrada a): `apps/web/src/pages/listas-page.tsx:104` (`NewListSheet`), `repositories.ts:396` (`createList`)
- Lista existente (entrada b): `apps/web/src/pages/lista-detail-page.tsx`, `repositories.ts:453` (`setListEntry`)

## Deferred Ideas
- Histórico de prompts / "gerar de novo" (regenerate) — pós-MVP
- Persistir gerações server-side pra analytics de uso
- Sugerir categoria/unidade do item novo via prompt (bônus do modelo)
- Voz → texto (ditar o prompt) — futuro
- Fallback pra outro provider (OpenAI) quando Gemini fora — YAGNI (env-gate cobre)
