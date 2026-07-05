# Importar NFC-e por QR — Specification

## Problem Statement

Registrar preços hoje é manual (digitar item por item, ou OCR de um preço por vez em `check-item-sheet`). Um cupom fiscal de supermercado tem 20-40 linhas com descrição, quantidade e valor unitário — todos já estruturados pela SEFAZ e acessíveis pelo QR do cupom (a página de consulta pública exibe o DANFE completo com itens, por especificação ENCAT). Escaneando um QR, o app pode importar preços de uma compra inteira em segundos e virar killer-feature Pro. Falta: consultar+parsear o portal da UF (1 parser por família de portal; sem lib OSS mantida — escrevemos os nossos), casar cada linha com o catálogo da casa (descrições de cupom são abreviadas: "ARROZ TP1 5KG CAMIL"), revisar e confirmar, gateando por plano.

## Goals

- [ ] Escanear QR de NFC-e → tela de revisão com itens matcheados/novos → confirmar → `price_records` (sempre) + inventário
- [ ] Roteamento por UF: parsers próprios (SVRS/SP/MG), adapter pago env-gated (SE via Infosimples), erro tipado nas demais — via porta `NfceLookup` (mesmo padrão do e-mail/billing)
- [ ] Matching híbrido que degrada sozinho: fuzzy/normalização sempre; embedding Gemini só como desempate quando `GEMINI_API_KEY` existe
- [ ] Gate: Free 2 imports/mês (degustação); Pro ilimitado com fair-use invisível 60/mês (teto de custo)
- [ ] LGPD: descartar CPF do consumidor; guardar só itens + emitente (CNPJ) + chave

## Out of Scope

| Feature | Reason |
|---|---|
| Foto/OCR do cupom | MVP é só QR; entrada por imagem fica deferred |
| Digitação manual de chave de acesso | Rota de consulta por chave avulsa tem reCAPTCHA desde 2017 — inviável server-side |
| CF-e SAT modelo 59 (SP varejo) | Documento diferente (satsp.fazenda.sp.gov.br); MVP é NFC-e modelo 65. SP aqui = notas 65 |
| WebView no dispositivo p/ UFs com WAF | Evolução; MVP cobre SE via adapter pago, demais UFs = erro tipado |
| Pix Automático / cobrança | Feature é import de dados, não pagamento (billing é outra feature) |
| Sync pull server→client de entidades em lote | Não existe endpoint batch hoje; import cria via repositórios+outbox (offline-first) |
| Revender base agregada de preços | Fora do escopo e vetado por LGPD (dados identificáveis) |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Entrada MVP | Só QR (scanner já lê `qr_code`) | Confiável 100% offline; chave é sempre o campo 1 do `p=` | y (user) |
| Gate Free | 2 imports/mês (degustação) | Mostra valor, cria motivo de assinar | y (user) |
| Gate Pro | Ilimitado + fair-use invisível 60/mês | Teto de custo (Infosimples/Gemini); nunca anunciado | y (user) |
| Embeddings | Gemini `gemini-embedding-001` @768d, env-gated | #1 MTEB multilíngue; free tier cobre o volume; degrada p/ fuzzy sem chave | y (user) |
| UFs suportadas | Parsers próprios SVRS/SP/MG + adapter SE (Infosimples); demais → erro | SVRS/SP/MG abertos (confirmado empírico); SE bloqueado (Turnstile) | y (user) |
| Cache | Por chave de acesso (nota imutável) | Re-scan não re-consulta; idempotência + quota + cache num só lugar | y (user) |
| LGPD | Descartar CPF; guardar itens + emitente (CNPJ) | Consumidor consulta a própria nota; CNPJ é público de PJ | y (user) |
| Preços importados | Sempre criados; item novo é opt-in por linha | Preço é o valor central; não poluir catálogo sem consentimento | y (user) |
| Fetch server-side | UA de browser; volume baixo; via deep-link do QR (nunca consulta por chave) | Deep-link não tem captcha na maioria das UFs; chave avulsa tem | y (research) |
| Loja da nota | Match por CNPJ; `stores` não tem CNPJ hoje → coluna nova | Emitente identifica loja por CNPJ; nome muda | assumido (design decide) |
| `price_records.source` | Novo valor `'import'` no enum | Distingue preço importado de manual/shopping | assumido |
| Mês do contador | Mês-calendário UTC do household | Simples, sem timezone por casa | assumido |

**Open questions:** ver §Unresolved (design).

## User Stories

### P1: Escanear QR e importar preços ⭐ MVP
Como membro de uma casa, escaneio o QR do cupom da minha compra, o app lê os itens da nota, casa com meu catálogo, e eu confirmo pra registrar os preços de uma vez.

**Acceptance Criteria:**
1. WHEN usuário escaneia um QR cujo `rawValue` é uma URL de consulta NFC-e (contém chave de 44 dígitos no 1º campo do `p=`) THEN app SHALL extrair a chave e a UF (2 primeiros dígitos), e abrir o fluxo de import — não tratar como código de produto
2. WHEN a UF tem parser/adapter e o portal responde THEN servidor SHALL retornar itens estruturados {descrição, quantidade, unidade, valorUnitCents, valorTotalCents} + emitente {cnpj, nome}
3. WHEN os itens voltam THEN client SHALL exibir tela de revisão com cada linha classificada como **matcheado** (item do catálogo), **novo** (sem match) ou **ignorar**, tudo editável
4. WHEN usuário confirma THEN app SHALL criar 1 `price_records` por linha não-ignorada com `source='import'` (via repositório + outbox), e criar item novo APENAS nas linhas marcadas "criar" (opt-in)
5. WHEN a mesma chave já foi importada nesta casa THEN servidor SHALL retornar o resultado cacheado sem re-consultar a SEFAZ (idempotente) e o client SHALL avisar "nota já importada"
6. WHEN o QR é v2 (`chave|2|tpAmb|idCSC|hash`) OU v3 (`chave|3|tpAmb`, obrigatório desde nov/2025) THEN o parser da chave SHALL funcionar nos dois (chave = campo 1 em ambos)

**Independent Test:** fixture HTML de portal SVRS → parser retorna N itens; POST /nfce/lookup com chave RS → itens; confirm → N `price_records` criados.

### P1: Matching híbrido que degrada ⭐ MVP
Como usuário, as descrições abreviadas do cupom ("ARROZ TP1 5KG CAMIL") são casadas com meus itens ("Arroz") automaticamente, e o sistema funciona mesmo sem chave de embedding configurada.

**Acceptance Criteria:**
1. WHEN uma descrição de cupom contém um token que bate exato com item do catálogo (após normalização: uppercase, sem acento, strip de unidades `\d+(KG|G|L|ML|UN)` e abreviações) THEN sistema SHALL casar por fuzzy sem chamar embedding
2. WHEN o fuzzy fica ambíguo (score entre thresholds) E `GEMINI_API_KEY` existe THEN sistema SHALL usar cosine dos embeddings (catálogo cacheado + query) pra desempatar
3. WHEN `GEMINI_API_KEY` NÃO existe THEN o matching SHALL usar só fuzzy/normalização e nunca falhar por causa disso (embedding é opcional)
4. WHEN nenhum candidato passa o threshold mínimo THEN a linha SHALL vir marcada "novo" (sugestão de criar item), com nome pré-preenchido pela descrição da nota
5. WHEN a casa não tem catálogo (0 itens) THEN todas as linhas SHALL vir "novo" e o fluxo SHALL funcionar (nada de erro)
6. WHEN o embedding do item do catálogo já está cacheado (coluna no banco) THEN o sistema SHALL reusá-lo sem re-chamar a API; só itens sem cache (novos/renomeados) geram chamada

**Independent Test:** unit — "ARROZ TP1 5KG CAMIL" casa "Arroz" só com fuzzy; sem `GEMINI_API_KEY`, pipeline resolve e não lança; catálogo vazio → tudo "novo".

### P1: Gate de plano (degustação + fair-use) ⭐ MVP
Como dono Free, importo 2 notas/mês pra experimentar; como Pro, importo sem me preocupar (com um teto invisível de segurança).

**Acceptance Criteria:**
1. WHEN household Free já importou 2 notas neste mês e tenta a 3ª THEN servidor SHALL responder 403 `nfce_quota_free` (client mostra paywall Pro)
2. WHEN household Pro já importou 60 notas neste mês e tenta a 61ª THEN servidor SHALL responder 429 `nfce_quota_pro` (mensagem discreta "limite mensal atingido", sem paywall)
3. WHEN um re-scan de chave já importada acontece THEN ele SHALL retornar do cache e NÃO contar na quota (não é import novo)
4. WHEN a quota é contada THEN só imports que efetivamente consultaram (status `parsed`/`confirmed`) SHALL contar; um lookup que falhou (portal fora, UF sem parser) NÃO consome quota
5. WHEN o mês vira THEN o contador SHALL zerar (contagem por mês-calendário via `createdAt`)

**Independent Test:** seed 2 imports Free no mês → 3º lookup = 403; flip pro → ok; 60 imports pro → 61º = 429; re-scan de chave existente não incrementa.

### P2: Roteamento por UF via porta `NfceLookup`
Como dev, adiciono suporte a uma UF criando um parser (ou plugando um adapter), sem tocar no caller.

**Acceptance Criteria:**
1. Porta `NfceLookup` (`lookup(chave, url): Promise<NfceResult>`) com roteador por UF: SVRS/SP/MG → parser próprio; SE → adapter Infosimples se `INFOSIMPLES_TOKEN`; senão erro tipado — único lugar que conhece rotas concretas (espelha `email/index.ts`)
2. WHEN a UF é atendida por parser próprio THEN servidor SHALL fazer fetch com UA de browser + timeout e parsear o HTML do portal
3. WHEN a UF é Sergipe E `INFOSIMPLES_TOKEN` existe THEN servidor SHALL consultar via adapter Infosimples (JSON estruturado)
4. WHEN a UF é Sergipe E `INFOSIMPLES_TOKEN` NÃO existe THEN servidor SHALL responder 501 `state_unsupported`
5. WHEN a UF não tem parser próprio nem adapter THEN servidor SHALL responder 422 `uf_unsupported` (com a sigla da UF na resposta pra UI explicar)
6. WHEN o roteamento precisa da tabela de URLs por UF THEN ela SHALL estar embutida no código (cópia de `uri_consulta_nfce.json`), não como dependência de runtime

**Independent Test:** unit do roteador (chave RS→svrs, SP→sp, MG→mg, SE sem token→501, chave BA→422); adapter fake nos testes de integração.

### P2: Tela de revisão editável
Como usuário, reviso o que a nota trouxe antes de gravar: ajusto match, marco criar/ignorar, edito preço/quantidade.

**Acceptance Criteria:**
1. WHEN a revisão abre THEN cada linha SHALL mostrar descrição da nota, valor, e o match sugerido (item + confiança) com opção de trocar/criar/ignorar
2. WHEN usuário troca o match de uma linha THEN SHALL poder buscar item existente (reusa picker) ou criar inline (nome pré-preenchido pela nota)
3. WHEN usuário confirma THEN só linhas não-ignoradas SHALL virar `price_records`; linhas "criar" também criam o item e vinculam o EAN da nota (se presente) via `addBarcode`
4. WHEN a loja (CNPJ) da nota não existe em `stores` THEN o fluxo SHALL oferecer criar/casar a loja (uma vez por import), pra os preços terem `storeId`
5. Strings da tela nos 6 idiomas (`nfce.*`)

### P3: Feedback de erro por UF/portal
Como usuário numa UF sem suporte ou com portal fora do ar, entendo o que houve sem crash.

**Acceptance Criteria:**
1. WHEN a UF não é suportada THEN client SHALL mostrar mensagem clara ("importação ainda não disponível em {UF}") via `errors.uf_unsupported`
2. WHEN o portal da SEFAZ está fora/lento (timeout) THEN client SHALL mostrar "portal indisponível, tente mais tarde" (`errors.nfce_portal_error`) sem consumir quota
3. WHEN o QR não é de NFC-e (texto/URL qualquer) THEN o fluxo de import SHALL recusar graciosamente (`errors.nfce_invalid_qr`) e não abrir revisão

## Edge Cases

- WHEN QR ilegível / rawValue não bate padrão de URL SEFAZ THEN recusa com `nfce_invalid_qr`, sem lookup
- WHEN chave tem 44 dígitos mas UF (dígitos 1-2) não é código IBGE válido THEN `nfce_invalid_key`
- WHEN o HTML do portal mudou e o parser não acha itens THEN retorna `nfce_parse_failed` (não itens vazios silenciosos) — não conta quota, e há teste de fixture pra detectar a mudança
- WHEN a nota já foi importada (chave existe) THEN retorna cache, avisa, não conta quota, não duplica `price_records`
- WHEN a quota estourou (Free 2, Pro 60) THEN 403/429 tipado ANTES de consultar o portal (não gasta chamada externa)
- WHEN o matching é ambíguo (2+ itens empatam) THEN linha vem "novo"/"escolher" — nunca casa errado silenciosamente
- WHEN a linha é item novo E `GEMINI_API_KEY` off THEN funciona por fuzzy; NCM do item da nota pode sugerir categoria (bônus gratuito)
- WHEN a casa não tem catálogo THEN tudo "novo"; confirmar cria itens + preços
- WHEN Infosimples fora do ar / token inválido THEN `nfce_provider_error` 502, não conta quota
- WHEN dois membros escaneiam a mesma nota quase juntos THEN unique(household, chave) garante 1 registro; o 2º pega cache
- WHEN a nota traz CPF do consumidor no HTML/JSON THEN o parser SHALL descartá-lo (nunca persistir/logar)

## Requirement Traceability

| ID | Story | Phase | Status |
|---|---|---|---|
| NFCE-01 | P1 chave/UF + scanner intercept | Design | Pending |
| NFCE-02 | P1 lookup+parse+cache/idempotência | Design | Pending |
| NFCE-03 | P1 matching híbrido (fuzzy+embedding) | Design | Pending |
| NFCE-04 | P1 gate quota Free/Pro | Design | Pending |
| NFCE-05 | P2 porta NfceLookup + roteamento UF | Design | Pending |
| NFCE-06 | P2 tela de revisão + confirm | Design | Pending |
| NFCE-07 | P3 erros tipados por UF/portal | Design | Pending |

## Success Criteria

- [ ] Cupom real de RS/SP/MG: escanear → revisar → confirmar → N `price_records` corretos
- [ ] Sem `GEMINI_API_KEY`: matching funciona por fuzzy, nenhuma chamada de embedding
- [ ] Free bate 2/mês (403); Pro bate 60/mês (429); re-scan não conta
- [ ] Adicionar UF nova = 1 parser + 1 case no roteador (fake nos testes)
- [ ] CPF nunca aparece no banco nem nos logs

## Implicit-Dimensions Sweep (Large)

| Dimensão | Resolução |
|---|---|
| Input validation | zod no payload (chave 44 díg. numérica; url); QR validado por padrão SEFAZ; UF via chave, nunca body |
| Failure/partial | portal down → `nfce_portal_error`; parse falhou → `nfce_parse_failed`; adapter down → 502; nenhum conta quota |
| Idempotency/dedup | unique(household, chave) em `nfce_imports`; re-scan = cache, não duplica preços nem quota |
| Auth/rate limit | household-scoped (chave da sessão); import é mutação (viewer bloqueado); quota é o rate limit de negócio |
| Concurrency | unique(household,chave) serializa scans simultâneos da mesma nota; contagem de quota lê estado atual (soft — escala casa 2-4) |
| Data lifecycle | `nfce_imports` guarda itens+emitente+chave; CPF descartado; cache permanente (nota imutável) |
| Observability | log de cada lookup {uf, chave (hash/parcial), rota, status, nº itens}; nunca logar CPF |
| External failure | env-gate 501 (SE sem token); portal down 502/504 tipado; Gemini opcional degrada |
| State transitions | import: `pending`(criado) → `parsed`(itens ok) → `confirmed`(gravado) OU `failed`(erro, não conta quota) |
| i18n | `nfce.*` + `errors.*` (uf_unsupported, state_unsupported, nfce_invalid_qr, nfce_invalid_key, nfce_parse_failed, nfce_portal_error, nfce_provider_error, nfce_quota_free, nfce_quota_pro) nos 6 idiomas |
| Money | valores da nota em reais decimais → converter pra minor units (cents) na entrada; `price_records.priceCents` integer |
