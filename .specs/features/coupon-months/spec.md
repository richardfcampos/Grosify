# Feature: Coupon Months (cupom de meses grátis de Pro)

## Context
Cupom = código que dá N meses de Pro via NOSSO banco, sem gateway de pagamento. É a
evolução do `households.planOverride` que já existe (comp/100% off manual): antes o
override era permanente e só setável por SQL; agora ganha **validade** (`planOverrideUntil`)
e um caminho de **auto-resgate** pelo usuário em Ajustes.

Cupons são criados manualmente via SQL/admin (SEM UI de admin). O usuário só **resgata**.
A fonte da verdade continua sendo este banco — o plano efetivo é resolvido em
`resolveEffectivePlan` (billing/lifecycle.ts), que agora honra a validade do override.

## Requirements

### CUP-1 — Resgatar cupom válido
- CUP-1.1: `POST /billing/redeem-coupon {code}` — resgata um cupom pelo código.
- CUP-1.2: código é **case-insensitive** com **trim** — normalizado pra UPPERCASE antes
  de buscar (armazenado UPPERCASE na tabela).
- CUP-1.3: cupom só resgata se **válido** = existe + não expirado (`expiresAt` null ou
  futuro) + **com resgates restantes** (`maxRedemptions` null = ilimitado, ou
  `redeemedCount < maxRedemptions`).
- CUP-1.4: **1 resgate POR CASA por cupom** — unique(couponId, householdId). Duplo resgate
  da mesma casa é barrado (409).
- CUP-1.5: resgatar seta `households.planOverride = 'pro'` e estende
  `planOverrideUntil = max(now, planOverrideUntil atual) + N meses` (calendário —
  soma meses na data, não 30d fixos). **Extensão EMPILHA**: resgatar de novo (outro cupom)
  soma sobre o `until` vigente se ainda futuro, senão a partir de agora.
- CUP-1.6: `households.plan` **permanece como está** — o efetivo resolve via override.
- CUP-1.7: só **owner|admin** resgata (mesmo `canManageBilling` do checkout). member/viewer → 403.
- CUP-1.8: transação atômica: insere redemption (unique barra duplo), incrementa
  `redeemedCount`, atualiza household. Sucesso → `{ proUntil: <ISO> }`.
- CUP-1.9: rate limit 5/min por IP (mesmo padrão de convites).

### CUP-2 — Expiração do override no plano efetivo
- CUP-2.1: `resolveEffectivePlan` honra `planOverrideUntil`: override `'pro'` vale só se
  `planOverrideUntil` for **null** (permanente — comps existentes seguem funcionando) OU
  `> now`. Expirado (`until < now`) → override não vale mais, segue o fluxo normal de
  assinatura.
- CUP-2.2: **NÃO limpa** o override no banco ao expirar — só ignora (mantém histórico do
  que foi concedido). Diferente do write-behind de assinatura, que corrige `plan`.

### CUP-3 — UI de resgate em Ajustes
- CUP-3.1: campo de cupom na `PlanSection` (input + botão), visível pra **free E pro**
  (pro pode empilhar mais meses).
- CUP-3.2: sucesso → invalida `membership` (+ `billingSubscription`) e mostra
  "Pro até <data>" com a data no locale da UI.
- CUP-3.3: erros tipados inline (mesmo padrão vermelho do checkout).

## Error map (rota)
| Caso | Código | HTTP |
|------|--------|------|
| código inexistente | `coupon_invalid` | 404 |
| esgotado (sem resgates restantes) | `coupon_exhausted` | 410 |
| expirado (`expiresAt` passado) | `coupon_expired` | 410 |
| já resgatado por esta casa | `coupon_already_redeemed` | 409 |
| member/viewer (sem permissão) | `forbidden` / `read_only` | 403 |
| rate limit | `rate_limited` | 429 |

## Out of scope
- UI de admin pra criar/listar cupons (cupons nascem via SQL manual).
- Gateway de pagamento / desconto proporcional em assinatura paga.
- Cupom de % off sobre preço (só meses grátis de Pro).
- Notificação quando o override expira.

## Acceptance criteria
- Resgatar cupom válido (owner/admin) → casa vira Pro, `planOverrideUntil` = agora + N meses,
  retorna `{ proUntil }`.
- Resgatar 2 cupons → o 2º empilha sobre o `until` do 1º (soma meses no calendário).
- Mesma casa tentar resgatar o mesmo cupom 2x → 409 `coupon_already_redeemed`,
  `redeemedCount` não passa de 1 pra ela.
- Cupom esgotado → 410 `coupon_exhausted`; expirado → 410 `coupon_expired`;
  inexistente → 404 `coupon_invalid`.
- member/viewer → 403.
- `resolveEffectivePlan`: override com `until` futuro → pro; `until` passado → segue
  assinatura (sem limpar override); `until` null → pro permanente (comps existentes).
- UI: campo em Ajustes (free e pro), sucesso "Pro até X" no locale, erros inline.
- pt-BR real + placeholder inglês nos outros 5 idiomas (tradução em lote depois).
