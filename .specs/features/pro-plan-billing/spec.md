# Pro Plan + Multi-Gateway Billing — Specification

## Problem Statement

App tem plano `free|pro` no schema mas nada cobra nem gateia de verdade (maxItems suspenso, CTA desabilitado). Precisa: gates reais Free/Pro, cobrança via Asaas (BR: Pix/cartão/Pix Automático) e arquitetura strategy/DI (`PaymentProvider`) pra plugar Stripe (internacional) sem reescrever — mesmo padrão do e-mail (porta + adapters + env-gate).

## Goals

- [ ] Household Free tem limites reais; Pro remove — gates compartilhados client+server via `@grosify/shared`
- [ ] Owner/admin assina Pro (mensal/anual, BRL via Asaas) e status flui por webhook
- [ ] Trocar/adicionar gateway = novo adapter + case no factory; zero mudança em callers

## Out of Scope

| Feature | Reason |
|---|---|
| Stripe live | Sem pagante internacional ainda; entra como stub 501 (porta pronta) |
| Lifetime/compra única | Usuário escolheu mensal+anual só |
| IAP (App Store/Play) | App nativo é fase 7; assinatura vive no web |
| Cupom de desconto parcial | Motor de cupom do provedor; adia até campanha existir |
| NFC-e scan (feature Pro futura) | Feature separada; não bloqueia billing |
| Retail media/cashback/dados B2B | Monetização fase 2+ |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Checkout UX | Redirect pro checkout hosted do provedor (link Asaas) | Menos PCI/UI; padrão do mercado | assumido |
| Grace em falha de cobrança | Provedor faz retry; Pro mantém enquanto status ≠ `overdue/canceled`; `overdue` > 7d → downgrade | Simples, status-driven | assumido |
| Comp/100% off | Coluna `planOverride` no household (entitlement no nosso banco), sem passar por gateway | 100% = sem cobrança; provider-agnóstico | assumido (conversa anterior) |
| Quem pode assinar/cancelar | `owner` e `admin` do household | Papéis já existem | assumido |
| Preços por moeda | Config em shared (`PLAN_PRICES`): BRL 1290/9900; USD 399/2900 (Stripe futuro) | Preço psicológico local, não câmbio | y (conversa) |
| Uma assinatura por household | Constraint única em `subscriptions(household_id)` ativa | Assinatura pertence ao household (STATE.md) | y |

**Open questions:** none — resolvidos ou logados acima.

## User Stories

### P1: Gates Free/Pro reais ⭐ MVP
Como dono de casa Free, vejo limites claros (2 membros, 30 itens, 2 listas, 90d histórico) e o que o Pro desbloqueia (ilimitado + fotos + alertas de preço + analytics + export), pra eu ter motivo de assinar.

**Acceptance Criteria:**
1. WHEN household Free tem 30 itens e cria o 31º THEN API SHALL responder 403 `item_limit` (client mostra paywall)
2. WHEN household Free tem 2 listas e cria a 3ª THEN API SHALL responder 403 `list_limit`
3. WHEN household Free tem 2 membros e aceita convite do 3º THEN API SHALL responder 403 `member_limit`
4. WHEN household Free acessa foto de item, alerta de preço, analytics ou export THEN sistema SHALL bloquear com CTA Pro (fotos: rota `/uploads` 403 `pro_required`; client esconde/paywalla)
5. WHEN household é Pro THEN nenhum dos limites acima SHALL aplicar
6. WHEN plano expira (downgrade) THEN dados acima do teto SHALL ficar invisíveis (filtro de leitura, nada apagado) e voltar no re-upgrade — mesmo padrão do `historyCutoff`
7. WHEN household Free tem dados invisíveis (itens/listas/histórico acima do teto) THEN client SHALL exibir aviso persistente com a contagem oculta ("N itens ocultos") e CTA de upgrade explicando que o Pro os revela

**Independent Test:** seed household free com 30 itens → POST item = 403; flip pra pro → 201.

### P1: Assinar Pro via Asaas (BRL) ⭐ MVP
Como owner/admin, assino Pro (mensal R$12,90 / anual R$99) pagando Pix ou cartão; casa vira Pro quando o pagamento confirma.

**Acceptance Criteria:**
1. WHEN owner/admin POST `/billing/checkout` {cycle} THEN API SHALL criar assinatura no Asaas e responder URL de checkout hosted
2. WHEN member/viewer tenta THEN API SHALL responder 403
3. WHEN sem env `ASAAS_API_KEY` THEN rota SHALL responder 501 (padrão env-gate do projeto)
4. WHEN webhook Asaas confirma pagamento THEN `subscriptions.status` SHALL virar `active` e `households.plan` SHALL virar `pro`
5. WHEN webhook chega com assinatura desconhecida ou token inválido THEN API SHALL responder 401/404 sem efeito
6. WHEN mesmo evento de webhook chega 2x THEN segundo SHALL ser no-op (idempotente por event id)
7. WHEN household já tem assinatura ativa e tenta checkout THEN API SHALL responder 409 `already_subscribed`

**Independent Test:** checkout com sandbox Asaas → simular webhook `PAYMENT_CONFIRMED` → GET membership retorna plan=pro.

### P1: Ciclo de vida da assinatura ⭐ MVP
Como assinante, vejo status/próxima cobrança em Ajustes e posso cancelar; inadimplência tem grace de 7 dias.

**Acceptance Criteria:**
1. WHEN GET `/billing/subscription` THEN API SHALL retornar {status, cycle, currency, nextDueDate, provider} ou null
2. WHEN owner/admin cancela THEN provider SHALL ser cancelado, status `canceled`, e plan SHALL voltar a `free` no fim do período pago (não imediato)
3. WHEN webhook reporta atraso THEN status SHALL virar `overdue` mantendo `pro`; após 7d em `overdue` THEN plan SHALL virar `free`
4. WHEN plan vira `free` THEN AC-6 do story 1 (filtro de leitura) SHALL valer

**Independent Test:** simular webhooks OVERDUE/CANCELED e checar transições + plan.

### P2: Porta multi-gateway (strategy/DI)
Como dev, troco/adiciono gateway criando um adapter — callers não mudam.

**Acceptance Criteria:**
1. Porta `PaymentProvider` (create/cancel/parse webhook) com factory por env+moeda: BRL→asaas, senão→stripe — único lugar que conhece providers concretos (espelha `email/index.ts`)
2. WHEN moeda ≠ BRL e Stripe sem credencial THEN checkout SHALL responder 501 `provider_unavailable` (stub)
3. Webhooks normalizam pra evento interno único ({type, externalId, ...}) antes de tocar `subscriptions`
4. `subscriptions` guarda `provider` + IDs externos; assinatura ativa nunca re-roteia se moeda do household mudar

**Independent Test:** teste unitário do factory (env combos) + adapter fake nos testes de integração.

### P2: UI de plano em Ajustes
Substitui o CTA desabilitado: Free vê benefícios+preços e botão assinar (mensal/anual); assinante vê status/próximo vencimento/cancelar; strings nos 6 idiomas.

**Acceptance Criteria:**
1. WHEN Free abre Ajustes THEN SHALL ver comparativo e botões mensal/anual → redirect checkout
2. WHEN Pro abre THEN SHALL ver status, ciclo, próxima cobrança e cancelar (com confirm)
3. WHEN volta do checkout THEN app SHALL refetch membership e refletir plan (polling curto ou focus refetch)

### P3: Comp/100% (entitlement manual)
`households.planOverride` ('pro'|null) setável via SQL/admin futuro; entitlement = `planOverride ?? planFromSubscription`.

**Acceptance Criteria:**
1. WHEN planOverride='pro' THEN household SHALL ser Pro sem assinatura, ignorando gateway

## Edge Cases

- WHEN checkout criado mas webhook nunca chega THEN assinatura fica `pending`; novo checkout após 24h SHALL cancelar a pending e criar outra
- WHEN webhooks fora de ordem (CONFIRMED depois de CANCELED) THEN transição inválida SHALL ser ignorada (máquina de estados guarda)
- WHEN Asaas indisponível no checkout THEN API SHALL responder 502 `provider_error` (sem retry infinito client)
- WHEN household deletado com assinatura ativa THEN cancel no provider best-effort no fluxo de exclusão LGPD
- WHEN downgrade com 80 itens THEN os 30 mais antigos (createdAt asc) SHALL permanecer visíveis — regra determinística

## Requirement Traceability

| ID | Story | Phase | Status |
|---|---|---|---|
| BILL-01 | P1 gates | Design | Pending |
| BILL-02 | P1 checkout Asaas | Design | Pending |
| BILL-03 | P1 lifecycle | Design | Pending |
| BILL-04 | P2 porta/strategy | Design | Pending |
| BILL-05 | P2 UI Ajustes | Design | Pending |
| BILL-06 | P3 override | Design | Pending |

## Success Criteria

- [ ] Sandbox Asaas: assinar → pro; cancelar → free no fim do período; tudo por webhook
- [ ] Free bate nos 4 tetos com erro tipado + paywall no client
- [ ] Adicionar gateway fake em teste = 1 arquivo novo + 1 case no factory

## Implicit-Dimensions Sweep (Large)

| Dimensão | Resolução |
|---|---|
| Input validation | zod nos payloads (cycle enum, webhook shape); moeda via membership, nunca body |
| Failure/partial | pending sem webhook (edge case); 502 provider_error; env ausente 501 |
| Idempotency/dedup | webhook idempotente por event id (tabela `webhook_events` ou unique) |
| Auth/rate limit | owner/admin only; webhook por token (Asaas) / assinatura (Stripe); rate limit padrão das rotas |
| Concurrency | unique parcial: 1 assinatura não-terminal por household |
| Data lifecycle | subscriptions nunca apagadas (auditoria); status terminal |
| Observability | log de todo webhook (type, externalId, resultado) |
| External failure | env-gate 501; provider down 502; webhook retry é do provedor |
| State transitions | pending→active→overdue→(active|canceled); canceled/expired terminais; guarda contra ordem inválida |
