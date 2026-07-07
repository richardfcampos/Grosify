# Validation: coupon-months

**Verdict:** PASS
**Scope:** commits f4cdf6a..HEAD (spec, schema, lifecycle/resgate, rota, web)
**Verifier:** independent (não autor). Não altera código; única escrita é este arquivo.

## Gate

| Comando | Resultado |
|---|---|
| `pnpm --filter @grosify/api test` | 354 passed / 27 files |
| `pnpm --filter @grosify/web test` | 41 passed / 10 files |
| `pnpm typecheck` | 6/6 successful |

## Cobertura (AC/edge → evidência)

Impl: `apps/api/src/billing/coupons.ts`, `apps/api/src/billing/lifecycle.ts`,
`apps/api/src/routes/billing.ts`, `apps/api/src/db/schema.ts`,
`apps/web/src/features/billing/{coupon-redeem-form,plan-section}.tsx`.
Testes: `apps/api/src/test/coupons.test.ts` (unit lógica),
`apps/api/src/test/billing-routes.test.ts` bloco `POST /billing/redeem-coupon (CUP-1)` (rota/HTTP),
`apps/web/src/features/billing/coupon-redeem-form.test.ts` (couponErrorKey).

| AC/edge | Evidência (assertion) | Outcome |
|---|---|---|
| CUP-1.5 resgate válido → pro, until = now+N meses, `{proUntil}` | coupons.test.ts:106 (override=pro, until≈+3mo calendário, redeemedCount=1); billing-routes.test.ts:420 (200, proUntil ISO) | OK |
| CUP-1.6 `plan` materializado intacto, efetivo via override | coupons.test.ts:125-126 (plan='free', resolveEffectivePlan→'pro') | OK |
| CUP-1.2 case-insensitive + trim | coupons.test.ts:129 (`'  promo6  '`→redeemed); coupons.ts:47 `trim().toUpperCase()` | OK |
| CUP-1.5 empilhamento max(now,until)+N CALENDÁRIO | coupons.test.ts:137 (r2≈addMonths(r1,3)); coupons.ts:92 `until>now ? until : now`, addMonths via `setMonth` | OK |
| empilhamento c/ override expirado → parte de agora | coupons.test.ts:153 (until vencido −10d; proUntil>now) | OK |
| CUP-1.4 unique(couponId,householdId), dupla=already_redeemed, count fica 1 | coupons.test.ts:169 (2ª→already_redeemed, redeemedCount=1, redemptions=1); billing-routes.test.ts:464 (409); schema.ts:653 unique constraint | OK |
| inexistente → 404 coupon_invalid | coupons.test.ts:179 (invalid); billing-routes.test.ts:441 (404) | OK |
| esgotado (redeemedCount>=max) → 410 coupon_exhausted | coupons.test.ts:184 (max5/count5→exhausted), :204 (teto exato, casa 2→exhausted); billing-routes.test.ts:448 (410) | OK |
| expirado (expiresAt passado) → 410 coupon_expired | coupons.test.ts:190 (expired); billing-routes.test.ts:456 (410) | OK |
| maxRedemptions null = ilimitado | coupons.test.ts:196 (2 casas resgatam) | OK |
| CUP-1.7 owner|admin resgata; member/viewer → 403 | billing-routes.test.ts:434 (admin 200), :473 (member 403 forbidden), :481 (viewer 403 read_only); billing.ts:16 `canManageBilling` = owner|admin, :219 guard | OK |
| CUP-1.9 rate limit 5/min por IP → 429 rate_limited | billing-routes.test.ts:488 (6ª→429 rate_limited); billing.ts:217 `rateLimit({windowMs:60_000,max:5})`; rate-limit.ts:30 (429) | OK |
| CUP-1.8 transação atômica (insere+incrementa+atualiza) | coupons.ts:50 `db.transaction`, FOR UPDATE lock :55, insert :77, incremento :81, update household :95 | OK (verificado por código; unique/atomicidade exercidos em b/d) |
| CUP-2.1 override until futuro→pro; passado→segue assinatura; null→pro permanente | coupons.test.ts:214 (futuro→pro), :223 (passado→free), :237 (null→pro); lifecycle.ts:176 `until==null || until>now` | OK |
| CUP-2.2 NÃO limpa override expirado (só ignora) | coupons.test.ts:223 (após free: override='pro', until≠null intacto); lifecycle.ts:159 comentário + sem UPDATE do override | OK |

### Inspeção (UI — sem teste automatizado dedicado)

| AC | Evidência | Outcome |
|---|---|---|
| CUP-3.1 campo cupom visível free E pro | plan-section.tsx:143-151 CouponRedeemForm renderizado fora dos blocos `plan==='free'`/`'pro'` (sempre) | OK |
| CUP-3.2 sucesso → "Pro até <data>" locale + invalida membership/billingSubscription | plan-section.tsx:86 `toLocaleDateString(locale)`, :87 `t('billing.couponSuccess',{date})`, :88-89 invalidateQueries membership+billingSubscription | OK |
| CUP-3.3 erros tipados inline (padrão vermelho do checkout) | coupon-redeem-form.tsx:53 `<p style color var(--gro-red)>`; couponErrorKey mapeia código→`errors.<code>` (:6), 429→rate_limited, sem body→generic — coberto por coupon-redeem-form.test.ts:6 | OK |
| i18n 6 idiomas | 8 chaves de cupom (4 error codes + 4 UI labels) presentes em pt/en/es/it/de/fr | OK |

## Sensor (mutações — cada uma isolada, git checkout + tree limpa após)

| # | Mutação | Killed por | Status |
|---|---|---|---|
| a | empilhamento `max(now,until)` → sempre `now` (coupons.ts:92) | coupons.test.ts:137 "extensão EMPILHA" (1 fail) | KILLED |
| b | remover pré-check + retorno already_redeemed (coupons.ts:68-75) | coupons.test.ts:169 + billing-routes.test.ts:464 CUP-1.4 (2 fail, 2º insert estoura 23505→500) | KILLED |
| c | expiração override `until>now` → `until.getTime()>=0` (lifecycle.ts:176) | coupons.test.ts:223 CUP-2.2 (1 fail) | KILLED |
| d | esgotado `redeemedCount>=max` → `>` (coupons.ts:62) | coupons.test.ts:184 + :204 + billing-routes.test.ts:448 (3 fail) | KILLED |
| e | remover guard owner|admin no redeem (billing.ts:219) | billing-routes.test.ts:473 member→403 CUP-1.7 (1 fail) | KILLED |

**5/5 mutações killed.** Tree limpa após cada restore (git status vazio).

## Ranked gaps

Nenhum bloqueante.

Observações menores (não afetam o veredito):
1. Atomicidade concorrente (CUP-1.8) e o unique como rede sob concorrência real não têm
   teste de corrida dedicado — a serialização por `FOR UPDATE` + unique é verificada por
   código e indiretamente pelos sensores (b) e (d). Aceitável no tier leve.
2. UI (CUP-3.x) sem teste de render — só `couponErrorKey` é testado. Verificado por inspeção
   do código; consistente com o padrão inline do checkout.

## Tree

Limpa exceto `.specs/features/coupon-months/validation.md` (este arquivo).

## Open questions

Nenhuma.
