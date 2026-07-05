# Pro Plan + Multi-Gateway Billing — Context

**Gathered:** 2026-07-05
**Spec:** `.specs/features/pro-plan-billing/spec.md`
**Status:** Ready for design

## Feature Boundary

Gates Free/Pro reais + assinatura Pro (mensal/anual, BRL via Asaas live) + porta `PaymentProvider` strategy/DI com Stripe stub (501) roteado por moeda + UI de plano em Ajustes + override de entitlement (comp/100%).

## Implementation Decisions

### Gates Free/Pro (user escolheu "pacote completo")
- Free: 2 membros, 30 itens, 2 listas, 90d histórico
- Pro: ilimitado + fotos + alertas de preço + analytics + export
- Reativa `maxItems` (hoje suspenso em `packages/shared/src/plans.ts`)

### Gateways (user escolheu "Asaas live + Stripe stub")
- Asaas funcional: Pix, cartão, Pix Automático; env-gated (`ASAAS_API_KEY` ausente → 501)
- Stripe: adapter stub 501; porta/factory prontos; roteia `BRL→asaas, senão→stripe`
- Inversão de dependência espelhando `apps/api/src/email/index.ts` (factory = único lugar com providers concretos)

### Preço/ciclo (user escolheu "mensal + anual")
- BRL: R$ 12,90/mês, R$ 99/ano — `PLAN_PRICES` em shared
- USD (Stripe futuro): $3.99/mês, $29/ano
- Sem lifetime

### Downgrade (user escolheu "filtro de leitura")
- Mesmo padrão do `historyCutoff`: dados acima do teto ficam invisíveis, nada apagado, volta no re-upgrade
- Regra determinística: 30 itens mais antigos (createdAt asc) permanecem visíveis
- **Aviso obrigatório (refinamento do user):** client mostra aviso persistente com contagem do que está oculto + CTA "upgrade revela" — invisível nunca é silencioso

### Agent's Discretion
- Shape exato da tabela `subscriptions` + `webhook_events`
- UX do paywall no client (sheet vs banner)
- Polling vs focus-refetch pós-checkout

### Declined / Undiscussed Gray Areas → Assumptions (logadas no spec)
- Checkout hosted (redirect), grace 7d em overdue, comp via `planOverride`, owner/admin only, 1 assinatura ativa por household

## Specific References
- "strategy com inversão de dependências pra poder mudar fácil de gateway" — pedido explícito do usuário
- Padrão de referência: camada de e-mail (porta + adapters + env-gate + noop)

## Deferred Ideas
- Stripe live (quando houver pagante internacional)
- Lifetime deal de lançamento; cupons parciais; NFC-e scan como killer-feature Pro; retail media/cashback/dados B2B
