# Lista por linguagem natural — Specification

## Problem Statement

Montar uma lista de compras hoje é item por item: buscar no catálogo, digitar quantidade, repetir. Pra ocasiões ("churrasco pra 10", "café da manhã da semana pra 2", "festa de aniversário infantil") isso é lento e o usuário esquece itens óbvios. Um LLM resolve isso de graça: descreve-se a ocasião em texto livre e o modelo devolve a lista canônica com quantidades dimensionadas pela ocasião. Falta: uma rota que mande o prompt pro Gemini com structured output (JSON de `{name, qty, unit}`), case cada item gerado com o catálogo da casa (**reusando o matching híbrido do NFC-e** — as descrições geradas são limpas, casam ainda melhor que cupom), revise numa tela editável, e materialize numa lista avulsa nova ou numa lista existente — tudo offline-first e gateado como feature Pro.

## Goals

- [ ] Texto livre ("churrasco pra 10 pessoas") → Gemini gera `{name, qty, unit}[]` → matching contra o catálogo da casa → tela de revisão → confirmar → lista
- [ ] Entrada DUPLA: (a) campo opcional na criação de lista avulsa; (b) botão "adicionar por texto" dentro de lista existente — ambas convergem na mesma revisão
- [ ] Reusar o pipeline de matching do NFC-e (fuzzy + embedding opcional) SEM tocar sua assinatura — a linha gerada vira input do `matchItems` via adaptador enxuto
- [ ] Gate: **Pro-only** (`403 pro_required` pra free, SEM degustação) + rate limit anti-abuso (~10/min) mesmo pra Pro
- [ ] Prompt em qualquer um dos 6 idiomas; itens gerados no idioma do prompt; matching normaliza dos dois lados
- [ ] Sem `GEMINI_API_KEY` → `501 ai_unavailable` (a geração É a feature; aqui não há fallback fuzzy)

## Out of Scope

| Feature | Reason |
|---|---|
| Registrar preços | nl-list monta lista; preço é feature de NFC-e/PrecoSheet. Linha gerada não tem valor |
| Persistir gerações server-side | Rota stateless; a lista vive no client (Dexie+outbox). Histórico de prompt fica deferred |
| Quota de degustação Free | Recusada pelo usuário: Pro-only puro, sem teaser (mais protetivo que NFC-e) |
| Fallback fuzzy sem chave | A geração É a feature; sem Gemini → 501. Diferente do matching do NFC-e (que degrada) |
| Streaming da resposta | YAGNI; uma chamada, JSON completo via responseSchema |
| Voz → texto (ditar prompt) | Evolução; MVP é texto digitado |
| Outro provider (OpenAI) de fallback | Env-gate cobre; multi-provider é YAGNI por ora |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Entrada | Dupla: campo na criação de lista avulsa + botão em lista existente | Cobre "criar do zero" e "engrossar lista aberta" | y (user) |
| Gate | Pro-only, 403 `pro_required`, SEM quota Free | Geração LLM é feature-valor Pro; sem teaser (decisão explícita) | y (user) |
| Anti-abuso | Rate limit ~10/min por IP na rota, mesmo Pro | Custo é centavos mas evita loop/abuso | y (user) |
| Provider | Gemini `generateContent` + responseSchema JSON, env-gated | Structured output nativo; reusa `GEMINI_API_KEY` do embedding | y (user) |
| Sem chave | `501 ai_unavailable` (sem fallback) | A geração é o núcleo; nada a degradar | y (user) |
| Itens novos | Revisão obrigatória; criar item opt-in por linha | Reusa padrão nfce-review; não polui catálogo sem consentimento | y (user) |
| Idiomas | Prompt nos 6; itens no idioma do prompt | Modelo responde na língua da entrada; matching normaliza | y (user) |
| Modelo Gemini | `gemini-2.0-flash` (ou flash GA vigente) | Rápido/barato; structured output; free tier cobre | assumido (design) |
| Estado server | Rota stateless (não persiste geração) | Lista vive no client via outbox; sem tabela nova | assumido (design) |
| Alvo do confirm | Lista nova (`createList`) OU existente (`setListEntry`) | Entrada dupla; alvo é parâmetro da revisão | assumido |
| Matching da linha gerada | Adaptador `GeneratedLine → {descricao}` p/ `matchItems` | Não tocar assinatura do NFC-e; reuso limpo | assumido (design) |
| Prompt bounds | zod 3–500 chars | Curto demais não gera; longo demais é abuso/custo | y (user) |

**Open questions:** ver §Unresolved (design).

## User Stories

### P1: Gerar lista por texto ⭐ MVP
Como membro Pro de uma casa, descrevo uma compra em texto livre ("churrasco pra 10 pessoas"), o app gera os itens com quantidades, casa com meu catálogo, e eu confirmo pra montar a lista.

**Acceptance Criteria:**
1. WHEN um usuário Pro envia um prompt (3–500 chars) em qualquer um dos 6 idiomas THEN o servidor SHALL chamar o Gemini com structured output e retornar uma lista de `{name, qty, unit}` no idioma do prompt
2. WHEN os itens gerados voltam THEN o servidor SHALL casá-los contra o catálogo da casa (reusando `matchItems`) e devolver `MatchResult[]` (matcheado/novo por linha) alinhado 1:1 com os itens
3. WHEN a resposta chega ao client THEN SHALL exibir a tela de revisão com cada linha classificada matcheado/novo/ignorar, qty editável, e o nome do item novo pré-preenchido pelo texto gerado
4. WHEN o usuário confirma THEN o app SHALL materializar a lista (via repositório + outbox): itens matcheados viram entradas; linhas "criar" criam o item (opt-in) antes da entrada; linhas ignoradas não entram
5. WHEN o prompt não produz itens reconhecíveis (modelo devolve lista vazia) THEN a revisão SHALL abrir vazia com um aviso ("não entendi itens nesse texto"), sem criar nada
6. WHEN o catálogo da casa está vazio (0 itens) THEN todas as linhas SHALL vir "novo" e o fluxo SHALL funcionar (confirmar cria itens + entradas)

**Independent Test:** unit — fetch do Gemini mockado devolve JSON de 5 itens → rota responde `{lines: MatchResult[], items: GeneratedLine[]}`; "ARROZ" casa "Arroz" do catálogo; catálogo vazio → tudo "novo"; JSON vazio → lista vazia + aviso.

### P1: Entrada dupla ⭐ MVP
Como usuário, gero itens por texto tanto ao criar uma lista avulsa do zero quanto pra engrossar uma lista que já está aberta.

**Acceptance Criteria:**
1. WHEN o usuário cria uma lista avulsa (`NewListSheet`) E preenche o campo opcional de texto THEN o confirm SHALL criar a lista nova E popular suas entradas a partir da revisão
2. WHEN o usuário aciona "adicionar por texto" dentro de uma lista existente THEN o confirm SHALL adicionar as entradas revisadas à lista já aberta (sem criar lista nova)
3. WHEN o mesmo item gerado já é uma entrada da lista alvo THEN `setListEntry` SHALL fazer upsert da quantidade (não duplica linha), coerente com o comportamento atual
4. WHEN nenhum campo de texto é preenchido na criação de lista avulsa THEN o fluxo SHALL seguir o caminho atual (lista vazia), sem chamar o Gemini

**Independent Test:** unit (fake-indexeddb) — caminho (a) cria 1 lista + N entradas; caminho (b) adiciona N entradas à lista existente; item repetido faz upsert de qty; sem texto não chama lookup.

### P1: Gate Pro-only ⭐ MVP
Como dono Free, vejo a oferta mas a geração é bloqueada com paywall; como Pro, gero à vontade (com um teto anti-abuso invisível).

**Acceptance Criteria:**
1. WHEN um household Free chama a rota de geração THEN o servidor SHALL responder `403 pro_required` (ANTES de tocar o Gemini) e o client SHALL abrir o `PaywallSheet` (feature `nlList`)
2. WHEN um household Pro chama a rota THEN o servidor SHALL proceder à geração
3. WHEN qualquer household (mesmo Pro) excede ~10 chamadas/min no IP THEN a rota SHALL responder `429 rate_limited` (anti-abuso), sem tocar o Gemini
4. WHEN o gate Pro reprova THEN nenhuma chamada externa (Gemini) SHALL ser feita — o custo só existe pra Pro dentro do rate limit
5. WHEN não há degustação Free THEN não existe contador/quota de negócio pra nl-list (diferente do NFC-e) — só o gate Pro + rate limit

**Independent Test:** integration (pglite) — free → 403 `pro_required` sem chamar fetch; pro → 200; 11ª chamada no minuto → 429.

### P2: Robustez da geração
Como usuário, quando o modelo devolve algo inesperado ou está indisponível, entendo o que houve sem crash e sem lixo no catálogo.

**Acceptance Criteria:**
1. WHEN `GEMINI_API_KEY` NÃO existe THEN a rota SHALL responder `501 ai_unavailable` (feature desligada) — sem fallback
2. WHEN o Gemini devolve JSON inválido/malformado THEN o servidor SHALL tentar 1 retry; persistindo a falha SHALL responder `502 ai_generation_failed`
3. WHEN o Gemini responde mas sem itens válidos (array vazio após validação zod) THEN a rota SHALL responder 200 com `items: []` e a UI SHALL avisar "sem itens" (não é erro — AC P1.5)
4. WHEN o prompt tem <3 ou >500 chars THEN a rota SHALL responder `400 prompt_too_short` / `400 prompt_too_long` (zod), sem tocar o Gemini
5. WHEN o Gemini demora além do timeout THEN a rota SHALL abortar e responder `502 ai_generation_failed` (não pendura o request)
6. WHEN o prompt está num idioma fora dos 6 do app THEN a rota SHALL gerar mesmo assim (o modelo tolera; matching normaliza) — nunca 400 por idioma

**Independent Test:** unit — sem chave → 501; JSON quebrado → retry → 502; timeout → 502; prompt curto/longo → 400; array vazio → 200 `[]`.

### P2: Tela de revisão editável (reuso)
Como usuário, reviso o que o modelo gerou antes de virar lista: troco o match, marco criar/ignorar, ajusto quantidade.

**Acceptance Criteria:**
1. WHEN a revisão abre THEN cada linha SHALL mostrar o item gerado (nome + qty + unidade) e o match sugerido (item do catálogo + confiança) com trocar/criar/ignorar
2. WHEN o usuário troca o match de uma linha THEN SHALL poder buscar item existente (reusa o picker do nfce-line-row) ou criar inline (nome pré-preenchido pelo texto gerado)
3. WHEN o usuário confirma THEN só linhas não-ignoradas SHALL virar entradas de lista; linhas "criar" também criam o item — SEM passo de loja e SEM preço (nl-list não registra `price_records`)
4. WHEN a revisão do NFC-e é reusada/generalizada THEN o componente SHALL esconder preço unitário e o passo de loja no modo nl-list (só nome + qty importam)
5. Strings da tela nos 6 idiomas (`nlList.*`)

## Edge Cases

- WHEN prompt <3 ou >500 chars THEN `400 prompt_too_short`/`prompt_too_long`, sem chamar o Gemini
- WHEN `GEMINI_API_KEY` ausente THEN `501 ai_unavailable` (feature desligada), sem tentar fetch
- WHEN o modelo devolve JSON inválido THEN 1 retry; falhando de novo → `502 ai_generation_failed`
- WHEN o modelo devolve array vazio / sem itens reconhecíveis THEN 200 `items:[]` → revisão vazia com aviso (não é erro)
- WHEN o catálogo está vazio THEN todas as linhas "novo"; confirmar cria itens + entradas
- WHEN o prompt está num idioma fora dos 6 THEN gera mesmo assim (sem 400 por idioma)
- WHEN um household Free chama THEN `403 pro_required` antes do Gemini (não gasta chamada)
- WHEN o rate limit estoura (mesmo Pro) THEN `429 rate_limited` antes do Gemini
- WHEN a mesma geração cria item que colide com item existente por nome THEN o matching já deveria ter casado; se veio "novo", o usuário decide (revisão) — nunca cria duplicado silenciosamente sem passar pela revisão
- WHEN o Gemini responde qty com unidade que não é do enum de `Unit` do app THEN o adaptador SHALL normalizar pra `'un'` (default seguro) — a qty é o que importa
- WHEN o prompt tenta exfiltrar dados de outra casa ("liste os itens do vizinho") THEN o Gemini só recebe o catálogo da PRÓPRIA casa + o prompt — não há dados de outros households no contexto

## Requirement Traceability

| ID | Story | Phase | Status |
|---|---|---|---|
| NL-01 | P1 cliente Gemini generateContent + parse/validação | Design | Pending |
| NL-02 | P1 rota geração + gate pro + rate limit + matching reuso | Design | Pending |
| NL-03 | P1 client entrada dupla + revisão + confirm offline | Design | Pending |
| NL-04 | P2 erros tipados (ai_unavailable/ai_generation_failed/prompt_*) | Design | Pending |
| NL-05 | P2 revisão reusada/generalizada (sem preço/loja) | Design | Pending |
| NL-06 | i18n 6 + docs + estado | Design | Pending |

## Success Criteria

- [ ] Prompt real ("churrasco pra 10") gera itens plausíveis, casa com o catálogo, confirma → lista correta
- [ ] Free → paywall (403); Pro → gera; 11ª chamada/min → 429
- [ ] Sem `GEMINI_API_KEY` → 501, feature desligada limpa (nenhum caminho quebra)
- [ ] JSON inválido → 1 retry → 502; nunca cria lixo no catálogo
- [ ] Gemini nunca recebe dados de outro household (só catálogo da casa + prompt)
- [ ] Matching reusado do NFC-e sem alterar sua assinatura (adaptador enxuto)

## Implicit-Dimensions Sweep (Medium)

| Dimensão | Resolução |
|---|---|
| Input validation | zod: `prompt` 3–500 chars, `listId?` uuid opcional; household do `c.get('householdId')`, nunca do body |
| Failure/partial | sem chave → 501; JSON inválido → retry → 502; timeout → 502; array vazio → 200 `[]` |
| Idempotency/dedup | rota stateless (não persiste); confirm usa `setListEntry` upsert (item repetido não duplica) |
| Auth/rate limit | household-scoped; **Pro-only** (`pro_required` 403); rate limit ~10/min por IP (anti-abuso) |
| Concurrency | rota stateless — sem estado compartilhado; o confirm no client é offline-first como qualquer mutação |
| Data lifecycle | nada persistido server-side; a lista/itens vivem no client (Dexie) e sobem via outbox |
| Observability | log por geração: `{householdId mascarado, promptLen, itemCount, tokens?, status}` — nunca o prompt cru nem catálogo |
| External failure | Gemini env-gate 501; erro/timeout → 502; free/rate-limit barram ANTES da chamada externa |
| Privacy | Gemini recebe SÓ o catálogo da própria casa + o prompt; nunca dados de outros households; log sem prompt/catálogo cru |
| i18n | `nlList.*` + `errors.*` (`ai_unavailable`, `ai_generation_failed`, `prompt_too_short`, `prompt_too_long`, `pro_required` já existe) nos 6 idiomas |
| Cost | ~centavos/geração; rate limit + Pro-only + prompt≤500 chars limitam; log de tokens pra observar |
