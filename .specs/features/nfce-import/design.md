# Importar NFC-e por QR — Design

**Spec**: `.specs/features/nfce-import/spec.md`
**Context**: `.specs/features/nfce-import/context.md`
**Status**: Draft (aguardando aprovação)
**Base da pesquisa**: 4 relatórios (viabilidade QR/SEFAZ, APIs de terceiros, embeddings, scout de integração) — file:line/URLs citados abaixo vêm daí.

---

## Abordagens consideradas (Large → exploração obrigatória)

### Rota de consulta (como obter os itens da nota)

| | Abordagem | Trade-off |
|---|---|---|
| **A (recomendada)** | **Deep-link do QR, fetch+parse server-side por UF** + adapter pago só nas UFs bloqueadas | ✅ custo zero nas UFs abertas (SVRS/SP/MG confirmados HTTP 200 sem captcha hoje); ✅ dados completos por ENCAT. ❌ 1 parser por família de portal; quebra quando SEFAZ redesenha (mitigado por fixture) |
| B | API paga única pra tudo (Infosimples 27 UFs) | ✅ 1 integração, JSON limpo, cobre SE. ❌ piso R$100/mês independente de volume; custo por consulta em toda nota; dependência externa dura |
| C | Consulta manual por chave (sem QR) | ❌ reCAPTCHA desde 2017 em várias UFs; inviável server-side. Descartada |
| D | WebView no dispositivo (request sai do IP/browser do usuário) | ✅ contorna WAF/Turnstile de graça (uso pretendido pelo fisco). ❌ parsing no client, UX de webview, mais superfície. Fica como evolução p/ SE |

**Escolha: A + fallback pago só onde A não funciona.** Parsers próprios pras UFs abertas (custo zero, volume baixo); Sergipe (Turnstile confirmado) via Infosimples env-gated; demais UFs = erro tipado até termos parser. B fica anotada como caminho se o nº de UFs bloqueadas crescer. D (WebView) é a evolução natural de SE sem custo.

### Matching (casar descrição de cupom com catálogo)

| | Abordagem | Trade-off |
|---|---|---|
| **Híbrido (recomendado)** | Normalização + fuzzy token-set primeiro; **embedding só pros não resolvidos** | ✅ ~80-90% resolve só com token (categoria aparece literal na descrição); embedding é minoria; degrada sem chave. ❌ 2 caminhos de código |
| Só embedding | Cosine de tudo contra tudo | ❌ chamada de API por linha sempre; quebra sem chave; custo/latência à toa em recompra |
| Só fuzzy | Sem embedding nenhum | ✅ zero dep externa. ❌ perde sinônimos opacos ("MACARRAO ESPAGUETE"→"Massa") |
| pgvector | Índice vetorial no Postgres | ❌ overkill: ≤200 itens/casa = 0.6 MB, cosine em memória <1ms. Infra nova à toa |

**Escolha: híbrido, cosine em memória, sem pgvector.** Embedding é **opcional** (env-gated Gemini). Catálogo cacheado em coluna; query embeddada só quando o fuzzy empata.

---

## Architecture Overview

```mermaid
graph TD
    QR[ScannerModal lê qr_code] -->|rawValue = URL SEFAZ?| ICT[caller: detecta padrão SEFAZ<br/>extrai chave+UF]
    ICT -->|POST /nfce/lookup {chave,url}| RT[routes/nfce.ts<br/>requireHousehold]
    RT --> Q{quota: nfce_imports<br/>count no mês}
    Q -->|Free>=2| E403[403 nfce_quota_free]
    Q -->|Pro>=60| E429[429 nfce_quota_pro]
    Q -->|cache hit chave| CACHE[retorna itens cacheados<br/>não conta quota]
    Q -->|ok| F[nfce/index.ts roteador<br/>lookupFor UF]
    F -->|SVRS/SP/MG| P[parsers próprios<br/>fetch UA browser + parse HTML]
    F -->|SE + INFOSIMPLES_TOKEN| INFO[infosimples-adapter.ts]
    F -->|SE sem token| E501[501 state_unsupported]
    F -->|UF sem rota| E422[422 uf_unsupported]
    P --> ITEMS[NfceResult: itens + emitente<br/>CPF descartado]
    INFO --> ITEMS
    ITEMS --> M[nfce/matching.ts<br/>normaliza+fuzzy → embedding se ambíguo]
    M -->|GEMINI_API_KEY?| G[(Gemini embed<br/>opcional)]
    M --> REV[client: tela de revisão<br/>matcheado/novo/ignorar editável]
    REV -->|confirm| REPO[repositories: recordPrice source=import<br/>+ createItem opt-in + store por CNPJ]
    REPO --> OUT[outbox → POST /shopping/prices etc.]
```

**Fonte da verdade = nosso banco (offline-first).** O lookup é server-side (porta env-gated), mas a **gravação** segue o padrão do projeto: client cria via repositórios Dexie + outbox — não há endpoint batch. O servidor guarda a nota consultada (`nfce_imports`) pra cache/quota/idempotência; os `price_records`/itens fluem pela outbox como qualquer mutação.

**Inversão de dependência (mesmo pedido do billing/email):** porta `NfceLookup` + roteador (único lugar que conhece UFs concretas) + `setNfceLookup()` pra testes. UF nova = 1 parser + 1 case.

---

## Code Reuse Analysis

| Existente | Local | Uso |
|---|---|---|
| Scanner já lê QR | `apps/web/src/features/scanner/use-barcode-scanner.ts:5,16` | URL da NFC-e (~130+ chars) passa no `acceptValue` de `qr_code`; caller distingue por padrão de URL SEFAZ |
| ScannerModal `{onDetect,onClose}` | `apps/web/src/features/scanner/scanner-modal.tsx:11` | Reusar; abrir a partir do pós-compra (`compra-page.tsx:528+`, slot "anexar recibo" `:715-737`) e standalone |
| Intercept de QR desconhecido | `apps/web/src/pages/compra-page.tsx:108` (`resolveBarcode==null → UnknownBarcodeSheet`) | Ponto barato pra interceptar QR de nota ANTES do resolveBarcode |
| Padrão porta/factory/env-gate | `apps/api/src/email/index.ts:20` (factory+noop+setProvider) | Copiar pro `nfce/index.ts` (roteador por UF + setNfceLookup p/ testes) |
| Env-gate fetch externo | `apps/api/src/lib/turnstile.ts:10` (passthrough/fail-closed + `AbortSignal.timeout`) | Molde do fetch de portal SEFAZ e do adapter Infosimples (timeout + try/catch → erro tipado) |
| Env-gate #1 (R2) | `apps/api/src/lib/r2.ts:14` (`const enabled = Boolean(...)` + 501) | Molde de `INFOSIMPLES_TOKEN`/`GEMINI_API_KEY` |
| Rota household-scoped | `apps/api/src/routes/shopping.ts:211` (POST /prices; zValidator + onConflictDoNothing + FK→409) | Molde de `routes/nfce.ts` (`.use(requireHousehold)`, montado em `index.ts:46-53`) |
| Plan efetivo no request | `apps/api/src/middleware/household.ts:52` (`resolveEffectivePlan` → `c.get('plan')`) | Gate de quota lê `c.get('plan')` p/ escolher 2 vs 60 |
| Reconciliação linha-a-linha | `apps/web/src/features/brands/unknown-barcode-sheet.tsx:24` (busca OU cria inline + BrandPicker + addBarcode) | Padrão pronto pra revisão: descrição da nota pré-preenche o nome (no lugar do OpenFoodFacts) |
| Escrita de preço offline | `apps/web/src/db/repositories.ts:505` (`recordPrice` → Dexie put + enqueue POST /shopping/prices) | Import chama o mesmo caminho; **novo `source:'import'`** |
| Match barcode→item | `apps/web/src/db/repositories.ts:280` (`resolveBarcode`), `:132` (`addBarcode`) | EAN da nota vincula item na confirmação |
| Harness pglite | `apps/api/src/test/db-integration.test.ts` | Lookup/quota/cache (add `nfce_imports` ao TRUNCATE) |
| Harness fake-indexeddb | `apps/web` vitest.setup | Preflight/confirm no client |
| uuidv7 time-ordered | ids de todas as linhas | Sem coluna extra de ordem |

---

## Components

### 1. `packages/shared/src/nfce.ts` (novo — parsing puro, testável, sem I/O)
- `parseNfceQr(rawValue): { chave: string; url: string } | null` — aceita a URL do QR; extrai o campo 1 do `p=` (chave 44 díg.); valida v2 (`chave|2|...`) e v3 (`chave|3|...`); retorna null se não for padrão SEFAZ (→ `nfce_invalid_qr`)
- `ufFromChave(chave): Uf | null` — 2 primeiros dígitos = código IBGE; mapeia p/ sigla; null se inválido (→ `nfce_invalid_key`)
- `NFCE_UF_ROUTES` — tabela embutida (cópia de `uri_consulta_nfce.json` do sped-nfe): sigla → {portalUrlTemplate, family: 'svrs'|'sp'|'mg'|'infosimples'|null}
- `normalizeDescription(desc): string` — uppercase, sem acento, strip `\d+(KG|G|L|ML|UN|TP\d+)`, dicionário de abreviações BR (LTE→leite, REFRIG→refrigerante, CERV→cerveja, FGO→frango…)
- `NFCE_FREE_QUOTA=2`, `NFCE_PRO_QUOTA=60`, `nfceQuota(plan)` — teto por plano
- Constrói string pra i18n/erros compartilhados

### 2. `apps/api/src/nfce/` (novo módulo — a porta)
- `types.ts`: `NfceLookup { lookup(chave, url): Promise<NfceResult> }`; `NfceResult = { emitente:{cnpj,nome}, itens: NfceItem[] }`; `NfceItem = { descricao, quantidade, unidade, valorUnitCents, valorTotalCents, ean?, ncm? }` — **sem campo de CPF** (descartado na origem)
- `parsers/svrs-parser.ts`, `parsers/sp-parser.ts`, `parsers/mg-parser.ts`: cada um faz fetch (UA browser, `AbortSignal.timeout`) + parseia o HTML do portal → `NfceResult`; `<200 linhas` cada; **CPF nunca extraído**
- `infosimples-adapter.ts`: POST na API Infosimples com `INFOSIMPLES_TOKEN` → mapeia `produtos[]` (codigo/nome/quantidade/valor_unitario/valor_total) → `NfceItem[]`; JSON já estruturado
- `index.ts`: roteador `lookupFor(uf)`: family svrs/sp/mg → parser próprio; infosimples → adapter se `INFOSIMPLES_TOKEN` senão `state_unsupported`; null → `uf_unsupported`; `setNfceLookup()` p/ testes (mesmo shape do `email/index.ts`)
- `matching.ts`: `matchItems(itens, catalog): MatchResult[]` — (1) normaliza + fuzzy token-set (`fuzzball`); score ≥ alto → matcheado; (2) ambíguo E `GEMINI_API_KEY` → cosine (embedding query vs coluna cacheada do catálogo); (3) abaixo do mínimo → "novo"; catálogo vazio → tudo "novo"; **nunca lança por falta de chave**
- `embedding.ts`: `embed(texts): Promise<number[][] | null>` — Gemini `gemini-embedding-001` @768d, batch; retorna null sem `GEMINI_API_KEY` (matching cai pra fuzzy). Cosine em memória

### 3. Schema (migração 0027) — server guarda a nota, client guarda entidades
```ts
nfceImports: { id uuid pk (uuidv7), householdId uuid fk cascade,
  chave text,                 // 44 dígitos
  uf text, storeCnpj text, storeName text,
  status text enum['pending','parsed','confirmed','failed'],
  itemCount integer, rawJson jsonb,  // itens parseados (cache); SEM CPF
  createdAt tsz defaultNow, ...syncColumns? (server-authoritative, provavelmente sem sync) }
// unique(householdId, chave) → cache + idempotência + serialização de scan simultâneo
uniqueIndex('nfce_imports_household_chave_uq').on(householdId, chave)
index p/ contagem de quota: (householdId, createdAt) filtrando status IN ('parsed','confirmed')

items: + embedding jsonb null   // vetor 768d cacheado (gerado no create/rename; reusado no matching)
stores: + cnpj text null        // emitente identifica loja por CNPJ (hoje stores só tem nome/cidade/geo)
priceRecords.source enum: + 'import'   // distingue preço importado
```
**CPF do consumidor NÃO é persistido nem em `rawJson`** (LGPD): descartado no parser/adapter, antes de qualquer escrita ou log.

### 4. `apps/api/src/routes/nfce.ts` (novo) — household-scoped
- `POST /nfce/lookup {chave, url}` — requireHousehold (viewer bloqueado pelo middleware); zValidator; **quota primeiro** (count `nfce_imports` do mês por plano de `c.get('plan')`: Free≥2→403 `nfce_quota_free`, Pro≥60→429 `nfce_quota_pro`) — antes de tocar o portal; **cache** (chave existe → retorna `rawJson`, não conta quota); senão `lookupFor(uf)`: `uf_unsupported`→422, `state_unsupported`→501, portal timeout→504 `nfce_portal_error`, adapter erro→502 `nfce_provider_error`, parse vazio→422 `nfce_parse_failed` (status `failed`, **não conta quota**); sucesso → grava `nfce_imports` status `parsed` + retorna itens
- `GET /nfce/imports` — lista do mês (contador visível se precisar) — opcional
- Mount em `index.ts:46-53` (`.route('/nfce', nfceRoute)`)

### 5. Client (`apps/web`)
- **Intercept do QR**: no caller do ScannerModal (compra-page, standalone), se `parseNfceQr(rawValue)` retorna chave → abre fluxo de import; senão comportamento atual (produto). Reusa o scanner, sem lib nova
- **`lib/nfce-import.ts`**: chama `POST /nfce/lookup`; mapeia erros pra `errors.*`; roda `matchItems` server-side (matching é server; client só renderiza `MatchResult[]`)
- **Tela de revisão** (`features/nfce/nfce-review.tsx` + subcomponentes <200 linhas): lista `MatchResult[]`; por linha → matcheado (trocar), novo (criar inline, nome pré-preenchido), ignorar; editar preço/qty; **1 passo de loja** (casar/criar por CNPJ). Reusa o padrão do `unknown-barcode-sheet`
- **Confirm**: por linha não-ignorada → `recordPrice(itemId, storeId, priceCents, brandId, source:'import')` (via repositório+outbox); linhas "criar" → `createItem` + `addBarcode(ean)` antes do preço. Tudo offline-first
- **Entrada UI**: botão "Importar nota (QR)" no Summary pós-compra (`compra-page.tsx:528+`) + entrada standalone (rota nova no `router.tsx` seguindo `compraRoute:135`)
- **Gate no client**: import é ação Pro-degustação; o gate real é servidor (quota). Client mostra o botão pra todos; 403/429 → sheet/mensagem
- i18n: `nfce.*` + `errors.*` novos nos **6 locales**

---

## Error Handling Strategy

| Cenário | Tratamento | Usuário vê |
|---|---|---|
| QR não é NFC-e | `parseNfceQr` null → não abre import | fluxo normal de produto; se veio do botão import: `nfce_invalid_qr` |
| Chave 44 díg. mas UF inválida | 422 `nfce_invalid_key` (ou barra no client) | "cupom não reconhecido" |
| UF sem parser nem adapter | 422 `uf_unsupported` (sigla na resposta) | "importação ainda não disponível em {UF}" |
| SE sem `INFOSIMPLES_TOKEN` | 501 `state_unsupported` | idem + "em breve" |
| Portal SEFAZ timeout/down | 504 `nfce_portal_error` — **não conta quota** | "portal indisponível, tente mais tarde" |
| Infosimples down / token inválido | 502 `nfce_provider_error` — não conta quota | idem |
| HTML mudou, 0 itens | 422 `nfce_parse_failed` — não conta quota; log alerta | "não consegui ler essa nota" |
| Nota já importada (chave existe) | cache, não conta quota, não duplica | "nota já importada" + mostra itens |
| Free estourou 2/mês | 403 `nfce_quota_free` (antes do portal) | paywall Pro |
| Pro estourou 60/mês | 429 `nfce_quota_pro` (antes do portal) | mensagem discreta "limite mensal" |
| Gemini off/erro | matching cai pra fuzzy silenciosamente | resultado normal (talvez mais linhas "novo") |
| Catálogo vazio | tudo "novo" | revisão com criar-tudo |

**Handler nunca vaza CPF**: parsers/adapter descartam o campo antes de retornar; logs usam chave parcial/hash, nunca o HTML cru.

---

## Risks & Concerns

| Concern | Local | Impacto | Mitigação |
|---|---|---|---|
| HTML dos portais muda (SEFAZ redesenha) | parsers svrs/sp/mg | parser quebra silencioso, itens vazios | Fixture HTML por portal no teste (detecta regressão) + `nfce_parse_failed` gracioso (nunca itens vazios silenciosos); parser isolado por UF |
| Custo Infosimples (piso R$100/mês) | infosimples-adapter | conta trial acaba; SE fica caro | Env-gated (sem token = SE desligado, não quebra); só SE usa; decisão de preço/trial fica no checklist operacional do dono |
| Rate limit / bloqueio de IP por volume | fetch dos portais | consultas em massa → bloqueio temporário | Cache por chave (re-scan não consulta); volume baixo (import = ação pontual); UA de browser; quota limita abuso; timeout curto |
| CPF do consumidor no HTML/JSON | parsers/adapter | vazamento LGPD | Descartar no parser antes de retornar; `NfceItem`/`NfceResult` sem campo CPF; log sem HTML cru — verificado por teste |
| Conversão reais→cents | parsers/adapter | erro = preço 100x errado | `valorUnitCents = round(valor*100)`; teste explícito (ex. "12,90"→1290) por parser, igual ao risco do billing |
| `value` decimal com vírgula (pt-BR) | parsers | parse errado ("1.234,56") | Normalizar separadores no parser; teste de fixture com valores reais |
| SP majoritariamente CF-e SAT (modelo 59) | escopo | usuário SP escaneia cupom SAT e não funciona | Fora do MVP e documentado; SP aqui = NFC-e 65; erro tipado se vier SAT |
| Matching casa errado | matching.ts | preço no item errado | Thresholds conservadores; ambíguo → "novo"/escolher (nunca auto-match no empate); revisão é editável (humano confirma) |
| Free "hackeável" (quota client) | gate | burlar 2/mês via devtools | Quota é HARD no servidor (count `nfce_imports`); client é só UX |
| Embedding indisponível intermitente | embedding.ts | matching pior | Degradação graciosa (fuzzy sempre resolve maioria); embedding é desempate, não caminho crítico |
| Escrita em lote pela outbox | confirm | N POSTs; item novo rejeitado → FK nos preços | Reusar mapeamento FK→409 `ref_missing` (`shopping.ts:235`); criar item antes do preço na ordem do confirm |

---

## Tech Decisions (não-óbvias)

| Decisão | Escolha | Rationale |
|---|---|---|
| Rota de consulta | Deep-link do QR server-side (A) + adapter pago só p/ SE | Custo zero nas UFs abertas; deep-link não tem captcha (chave avulsa tem) |
| Roteamento UF | Tabela embutida (cópia `uri_consulta_nfce.json`) | Não depender de asset remoto em runtime; UF = 2 díg. IBGE |
| Matching | Híbrido fuzzy-primeiro; embedding opcional env-gated | ~80-90% resolve por token; degrada sem chave; recompra é hit direto |
| Vetores | Cosine em memória, coluna `items.embedding` jsonb | ≤200 itens/casa = <1ms; pgvector é overkill |
| Embedding | Gemini `gemini-embedding-001` @768d (MRL) | #1 MTEB multilíngue (pt); free tier cobre; melhor que OpenAI em pt |
| Quota | Free 2 / Pro 60 por mês-calendário, HARD no servidor | Degustação Free + teto de custo Pro invisível (pedido do user) |
| Cache/idempotência | `nfce_imports` unique(household,chave) | Nota imutável: re-scan não consulta, não duplica, não conta quota — 1 tabela faz cache+quota+idempotência |
| Gravação | Client via repositórios+outbox (offline-first), não batch server | Regra do projeto: todo write do client passa por Dexie+outbox |
| `source` do preço | Novo `'import'` no enum | Distingue de manual/shopping (analytics/auditoria) |
| CPF | Descartado no parser/adapter | LGPD; guardar só itens+CNPJ (público) |
| Preço vs item | Preço sempre; item novo opt-in por linha | Preço é o valor central; não poluir catálogo sem consentimento |
| Loja | Match por CNPJ (coluna nova em `stores`) | Emitente identifica por CNPJ; nome muda entre notas |
| SE bloqueado | Adapter Infosimples env-gated (não WebView no MVP) | Turnstile confirmado; WebView é evolução; adapter entrega já |

---

## Unresolved questions
1. Formato exato do HTML de cada portal (SVRS/SP/MG) — capturar fixtures reais na implementação (o parser depende do DOM atual; pesquisa confirmou HTTP 200 mas não o seletor exato).
2. Cobertura de itens da Infosimples por UF pra SE — pesquisa diz "completo" mas não há SLA público; validar no trial.
3. Se a tela de revisão deve permitir 1 loja por import ou múltiplas (nota tem 1 emitente → 1 loja; assumido 1).
4. Limites exatos do free tier de embeddings Gemini (fontes terceiras: ~100 RPM/1k RPD) — folga grande pro volume, mas confirmar no AI Studio se escalar.
