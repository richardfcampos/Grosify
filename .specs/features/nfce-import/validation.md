# Validation — nfce-import

**Verdict: PASS ✅**
**Verifier:** independente (não-autor). Método: evidência-ou-zero (file:line + assertion) + sensor de mutação.
**Data:** 2026-07-06
**Range de commits:** `2224ccb`..`0fb515e` (spec/design/tasks → HEAD). 15 tasks T1-T15 + fix parse v2 `fa70dd5` + fix vitest `0fb515e`.

---

## Gate

| Comando | Resultado |
|---|---|
| `pnpm --filter @grosify/api typecheck` | ✅ pass (tsc --noEmit, 0 erros) |
| `pnpm --filter @grosify/web typecheck` | ✅ pass (0 erros; ui já buildado) |
| `pnpm --filter @grosify/api test` | ✅ **21 arquivos, 276 testes, 0 failed** |
| `pnpm --filter @grosify/web test` | ✅ **5 arquivos, 22 testes, 0 failed** (2 nfce + 3 pré-existentes) |

Contagens batem com o esperado (~276 api / ~22 web). Nenhuma falha, nenhum skip suspeito.

---

## Cobertura ancorada no spec (por AC)

### P1 — Escanear QR e importar preços (NFCE-01/02)

| AC | Evidência | Outcome |
|---|---|---|
| 1 — QR URL SEFAZ → extrai chave+UF, abre import (não trata como produto) | `nfce-shared.test.ts:19-76` (parseNfceQr) + `nfce-import.test.ts:18-26` (isNfceQr true p/ SEFAZ, false p/ produto) | ✅ chave extraída, produto recusado |
| 2 — UF atendida → itens {desc,qtd,un,unitCents,totalCents}+emitente{cnpj,nome} | `svrs-parser.test.ts:20-49`, `sp-parser.test.ts:14-43`, `infosimples-provider.test.ts:66-101`; rota `nfce-routes.test.ts:149-171` | ✅ shape completo + cents |
| 3 — tela revisão matcheado/novo/ignorar editável | inspeção: `nfce-review.tsx:100-177` + `nfce-line-row.tsx:33-137` (match→trocar, novo→criar inline, ignore toggle, qty/preço editáveis) | ✅ por inspeção |
| 4 — confirm cria 1 price/linha source='import'; item novo só opt-in | `nfce-confirm.test.ts:48-91` (matcheado→1 price source=import, 0 item novo), `:93-124` (novo→item+price) | ✅ `prices[0].source==='import'` |
| 5 — mesma chave cacheada, sem re-consultar, avisa | `nfce-routes.test.ts:183-212` (cached:true, fetchItems 1x, alreadyImported true) | ✅ |
| 6 — QR v2 E v3 funcionam (chave=campo 1) | `nfce-shared.test.ts:20-43` (v2 5/6/8 campos + v3 3/4 campos) | ✅ ambos |

### P1 — Matching híbrido que degrada (NFCE-03)

| AC | Evidência | Outcome |
|---|---|---|
| 1 — token exato pós-normalização casa por fuzzy sem embedding | `matching.test.ts:23-29` ("ARROZ TP1 5KG CAMIL"→arroz, method fuzzy, conf>0.7) | ✅ |
| 2 — ambíguo E GEMINI_API_KEY → cosine desempata | `matching.test.ts:111-126` (MACARRAO→massa via embed mockado, method embedding) | ✅ |
| 3 — sem GEMINI_API_KEY → só fuzzy, nunca falha | `matching.test.ts:84-93` (fetch não chamado, resolve fuzzy) | ✅ |
| 4 — abaixo do threshold → "novo" nome pré-preenchido | `matching.test.ts:39-42,95-100` (suggestedName='ARROZ 5KG') | ✅ |
| 5 — catálogo vazio → tudo "novo", sem erro | `matching.test.ts:43-45,95-100`; rota `nfce-routes.test.ts:173-179` | ✅ |
| 6 — embedding cacheado reusado; só sem-cache chama API | `nfce-embedding-cache.test.ts:70-113` (cache hit sem fetch; batch parcial só pendentes) | ✅ |

### P1 — Gate de plano (NFCE-04)

| AC | Evidência | Outcome |
|---|---|---|
| 1 — Free 2/mês → 3ª = 403 `nfce_quota_free` | `nfce-quota.test.ts:142-154` (status 403, body exato, não grava 3ª) | ✅ |
| 2 — Pro 60/mês → 61ª = 429 `nfce_quota_pro` | `nfce-quota.test.ts:168-176` (429 + body); boundary `:178-185` (59→60ª passa) | ✅ `>=60` |
| 3 — re-scan cacheado NÃO conta quota | `nfce-quota.test.ts:207-219` (5 re-scans, used=1, 2º import passa) | ✅ |
| 4 — só parsed/confirmed contam; failed não | `nfce-quota.test.ts:189-205` (3 BA-failed não consomem Free) | ✅ |
| 5 — virada de mês zera contador | `nfce-quota.test.ts:222-238` (lastMonth não conta, used=0) | ✅ (janela UTC `nfce-import-service.ts:63-79`) |

### P2 — Roteamento por UF via porta NfceLookup (NFCE-05)

| AC | Evidência | Outcome |
|---|---|---|
| 1 — porta + roteador único; svrs/sp/mg parser, SE adapter±token, senão erro | `router.test.ts:43-127` + `index.ts:55-90` | ✅ espelha email/index |
| 2 — UF com parser → fetch UA browser + parse HTML | `portal-fetch.ts:29-67` (BROWSER_UA, timeout, retry); `errors.test.ts:36-44` | ✅ |
| 3 — SE + INFOSIMPLES_TOKEN → adapter JSON | `infosimples-provider.test.ts:144-148`, `router.test.ts:71-75` | ✅ |
| 4 — SE sem token → 501 `state_unsupported` | `router.test.ts:77-87`, `nfce-routes.test.ts:237-243` (501) | ✅ |
| 5 — UF sem rota → 422 `uf_unsupported` com sigla | `router.test.ts:89-99` (uf=BA), `nfce-routes.test.ts:225-235` (422, body.uf=BA) | ✅ |
| 6 — tabela de URLs embutida no código | `packages/shared/src/nfce.ts:173-203` (NFCE_UF_ROUTES const); `nfce-shared.test.ts:135-160` | ✅ |

### P2 — Tela de revisão editável (NFCE-06)

| AC | Evidência | Outcome |
|---|---|---|
| 1 — cada linha: desc, valor, match+confiança, trocar/criar/ignorar | inspeção `nfce-line-row.tsx:43-119` | ✅ por inspeção |
| 2 — trocar match: buscar existente OU criar inline | inspeção `nfce-line-row.tsx:121-198` (ItemPickerSheet: busca + criar) | ✅ por inspeção |
| 3 — confirm: só não-ignoradas→price; "criar"→item+addBarcode(EAN) | `nfce-confirm.test.ts:93-147` (item+barcode antes do preço; sem EAN→sem barcode), `:149-162` (lista vazia→0) | ✅ |
| 4 — loja por CNPJ: casar/criar 1x por import | `nfce-confirm.test.ts:164-227` (reusa por CNPJ; cria nova com cnpj); inspeção `nfce-store-step.tsx:25-58` | ✅ |
| 5 — strings nos 6 idiomas (`nfce.*`) | `nfce:` block presente em pt/en/es/it/de/fr | ✅ (grep 6/6) |

### P3 — Feedback de erro por UF/portal (NFCE-07)

| AC | Evidência | Outcome |
|---|---|---|
| 1 — UF não suportada → `errors.uf_unsupported` | `nfce-import.ts:54-71,88-92` (code→NfceImportError); locale key 6/6 | ✅ |
| 2 — portal timeout → `nfce_portal_error` sem quota | `nfce-import.test.ts:76-85`; `nfce-routes.test.ts:245-259` (504, status failed) | ✅ |
| 3 — QR não-NFC-e → `nfce_invalid_qr`, não abre revisão | `nfce-import.test.ts:68-74` (recusa sem chamar servidor) | ✅ |

### Edge Cases (spec §Edge Cases)

| Edge | Evidência | Outcome |
|---|---|---|
| QR ilegível/rawValue não-URL → `nfce_invalid_qr` sem lookup | `nfce-shared.test.ts:69-75`; `nfce-routes.test.ts:216-223` | ✅ |
| chave 44 díg. mas UF inválida → `nfce_invalid_key` | `nfce-shared.test.ts:125-128` (ufFromChave null); rota `nfce.ts:85-87` | ✅ |
| HTML mudou, 0 itens → `nfce_parse_failed`, não vazio silencioso | `svrs-parser.test.ts:87-103`, `sp-parser.test.ts:52-68`, `errors.test.ts:46-53` | ✅ |
| nota já importada → cache, avisa, não conta, não duplica | `nfce-routes.test.ts:183-212` | ✅ |
| quota estourou ANTES do portal | `nfce.ts:104-111` (quota antes de lookupFor); `nfce-quota.test.ts:152-154` (não grava) | ✅ |
| matching ambíguo (empate) → "novo", nunca casa errado | `matching.test.ts:47-54` (REFRIGERANTE empata→null) | ✅ |
| catálogo vazio → tudo novo | coberto em NFCE-03 AC5 | ✅ |
| Infosimples fora/token inválido → `nfce_provider_error` 502 | `infosimples-provider.test.ts:112-141`; `nfce-routes.test.ts:261-274` | ✅ |
| 2 membros mesma nota → unique(household,chave) 1 registro, 2º cache | migração `0027:12` unique + `nfce-routes.test.ts:198` (1 row) | ✅ |
| CPF no HTML/JSON → descartado, nunca persistido/logado | `svrs-parser.test.ts:51-57,80-84`, `sp-parser.test.ts:45-49`, `infosimples-provider.test.ts:103-109`, `errors.test.ts:89-119` (log) | ✅ |

**Total: 34/34 ACs cobertos por file:line + Edge Cases. UI pura (NFCE-06 AC1/AC2, revisão/loja) verificada por inspeção (componente + condição + chaves i18n 6/6).**

---

## Auditoria dos desvios da Fase 5 (contratos server estendidos em fase client)

| Desvio | Aditivo? | Quebra consumidor? | Testado? | Veredicto |
|---|---|---|---|---|
| Resposta do lookup ganha `itens` brutos | Sim (campo novo na resposta da rota, não no wire de sync) | Não — consumidores existentes não leem essa rota | `nfce-routes.test.ts:161-170`, `nfce-import.test.ts:64-65` | ✅ ok |
| `cnpj` no wire de stores (schema/payload/rota) | Sim — `storeSchema.cnpj nullable`, `createStorePayload.cnpj optional`, catalog rota `p.cnpj ?? null` | Não — nullable+optional; POST /stores existente sem cnpj → null | schema `index.ts:68-70`; `nfce-confirm.test.ts:204-227` (cnpj gravado) | ✅ ok |
| `'import'` em PRICE_SOURCES/createPricePayload/rota preços | Sim — enum aditivo com `default('manual')`; `source: p.source ?? 'manual'` | Não — callers sem source → 'manual' (comportamento idêntico ao anterior; diff shopping.ts é 1 linha backward-compat) | `nfce-confirm.test.ts:85,123` (source=import); repositório `recordPrice:509-538` threading no body | ✅ ok |

Todos os 3 desvios são **puramente aditivos e backward-compatible**; nenhum consumidor existente quebra (typecheck+276 testes verdes confirmam).

### Outros pontos de atenção auditados

- **Parse v2 5-8 campos (fix `fa70dd5`)**: teste **pina exatamente 5 campos** — `nfce-shared.test.ts:20-23` (`chave|2|1|1|A1B2C3D4E5F6`); + 6 (`:25`), + 8 (`:30`), + rejeita <5 (`:64-67`). Guarda de regressão presente. ✅
- **Payload {qrUrl} re-validado server-side** (design dizia {chave,url}): a rota deriva chave/UF de `parseNfceQr(qrUrl)` + `ufFromChave` (`nfce.ts:82-87`) — **UF nunca vem do body** (satisfaz spec §Implicit-Dimensions "UF via chave, nunca body" e NFCE-01 AC1). Desvio de design **melhora** a postura (chave não é confiável do client). ACs continuam satisfeitos. ✅
- **LGPD rawJson sem CPF**: parser nunca extrai CPF (svrs/sp/mg reusam `svrs-html`/`sp-html`, sem seletor de CPF); adapter descarta; log mascara chave (8 díg.) e só carrega `{uf,status,chave}`. Provado por teste em todos os caminhos (parsers + adapter + log). Mutation 6 confirma. ✅

---

## Sensor de mutação (7 mutações, 7 killed, 0 survived)

| # | Mutação | Arquivo:local | Teste que pegou | Resultado |
|---|---|---|---|---|
| 1 (a) | quota Free `>=` → `>` (off-by-one deixa 3ª passar) | `routes/nfce.ts:106` | `nfce-quota.test.ts:149` | **KILLED** |
| 2 (b) | cache: `findCachedImport` sempre retorna null | `nfce-import-service.ts:49` | `nfce-routes.test.ts:209` + quota re-scan (2 falhas) | **KILLED** |
| 3 (c) | conversão cents `*100` → `*10` | `parsers/html-parse.ts:37` | 6 testes de parser (risco 100x) | **KILLED** |
| 4 (d) | remove guarda de divergência >1% do total | `parsers/html-parse.ts:150` | `svrs-parser.test.ts:119` | **KILLED** |
| 5 (e) | inverte threshold fuzzy (`<` → `>`) | `matching.ts:114` | 4 testes de matching | **KILLED** |
| 6 (g) | LGPD: parser vaza CPF do consumidor no emitente | `parsers/svrs-html.ts:68` | 3 testes LGPD (RS+MG) | **KILLED** |
| 7 (f) | status machine: `failed` → `parsed` (failed contaria quota) | `nfce-import-service.ts:140` | 4 testes (route error status + quota "failed não conta") | **KILLED** |

Cobre os pontos mais críticos: gate de custo (quota/cache/status), correção monetária (cents/divergência), matching e LGPD. **0 sobreviventes** = suíte mata mutantes no coração do gate de custo, do dinheiro e da privacidade.

---

## Gaps ranqueados

Nenhum gap bloqueante. Observações menores (não-bloqueantes, sem ação exigida):

1. **(informativo) `parseNfceQr` exige host SEFAZ conhecido** (`nfce.ts:40,67-84`) — um QR de NFC-e válido de uma UF cujo host não está em `KNOWN_SEFAZ_HOSTS` seria recusado como `nfce_invalid_qr` mesmo tendo chave válida. É uma **restrição mais segura** que o spec (que só exige chave 44 díg. no campo 1); pode recusar notas legítimas de hosts não-listados até a lista crescer. Consistente com "MVP cobre UFs confirmadas". Não é regressão.
2. **(informativo) Cobertura de UI de revisão é por inspeção** (sem harness de render) — alinhado com a Test Coverage Matrix das tasks (`UI revisão/scanner: none, typecheck+build gate`). A lógica de confirm (o que grava) É testada (`nfce-confirm.test.ts`). Aceitável por design.

---

## Tree final

`git status --short`: **limpo** exceto `validation.md` (este arquivo) + `tasks.md` (marca de status, já presente antes da verificação). **Nenhum arquivo de código tocado** — todas as 7 mutações revertidas e confirmadas limpas via `git checkout` + `git status --short`.
