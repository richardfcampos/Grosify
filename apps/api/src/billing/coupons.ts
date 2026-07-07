import { eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../db/index.js';
import { couponRedemptions, coupons, households } from '../db/schema.js';

/**
 * Resultado discriminado do resgate — a rota mapeia cada caso pro par (código, HTTP).
 *   redeemed              → sucesso; proUntil é o novo fim do override
 *   invalid               → código inexistente
 *   exhausted             → cupom sem resgates restantes
 *   expired               → cupom com expiresAt no passado
 *   already_redeemed      → esta casa já resgatou este cupom
 */
export type RedeemResult =
  | { kind: 'redeemed'; proUntil: Date }
  | { kind: 'invalid' }
  | { kind: 'exhausted' }
  | { kind: 'expired' }
  | { kind: 'already_redeemed' };

/**
 * Soma `months` no calendário (não 30d fixos). Preserva o dia; se o mês destino não tem o
 * dia (ex.: 31/jan + 1 mês), o JS transborda pro mês seguinte — comportamento aceitável pra
 * validade de plano (nunca encurta o benefício). Mantém a hora/minuto do instante base.
 */
function addMonths(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Resgata um cupom pra uma casa. Transação atômica:
 *   1. busca o cupom por UPPER(trim(code)) travando a linha (FOR UPDATE) — serializa
 *      resgates concorrentes do mesmo cupom (evita furar maxRedemptions).
 *   2. valida validade (expiresAt) e esgotamento (redeemedCount vs maxRedemptions).
 *   3. insere a redemption — unique(couponId, householdId) barra o duplo resgate da casa
 *      (checado antes, mas o unique é a garantia real sob concorrência).
 *   4. incrementa redeemedCount.
 *   5. seta households.planOverride='pro' e estende planOverrideUntil = max(now, until) + N
 *      meses (EMPILHA sobre o override vigente se ainda futuro).
 * households.plan permanece como está — resolveEffectivePlan materializa o efetivo.
 *
 * `code` é normalizado (trim + UPPERCASE) — busca case-insensitive.
 */
export async function redeemCoupon(householdId: string, rawCode: string): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [coupon] = await tx
      .select()
      .from(coupons)
      .where(eq(coupons.code, code))
      .for('update')
      .limit(1);
    if (!coupon) return { kind: 'invalid' as const };

    if (coupon.expiresAt && coupon.expiresAt.getTime() < now.getTime()) {
      return { kind: 'expired' as const };
    }
    if (coupon.maxRedemptions != null && coupon.redeemedCount >= coupon.maxRedemptions) {
      return { kind: 'exhausted' as const };
    }

    // 1 resgate por casa: checa antes (retorno tipado) e conta com o unique como rede
    // final sob concorrência (tentativa duplicada estoura o constraint → 23505).
    const [already] = await tx
      .select({ id: couponRedemptions.id })
      .from(couponRedemptions)
      .where(
        sql`${couponRedemptions.couponId} = ${coupon.id} and ${couponRedemptions.householdId} = ${householdId}`,
      )
      .limit(1);
    if (already) return { kind: 'already_redeemed' as const };

    await tx
      .insert(couponRedemptions)
      .values({ id: uuidv7(), couponId: coupon.id, householdId });

    await tx
      .update(coupons)
      .set({ redeemedCount: coupon.redeemedCount + 1 })
      .where(eq(coupons.id, coupon.id));

    // Empilha: se o override atual ainda é futuro, soma a partir dele; senão a partir de agora.
    const [house] = await tx
      .select({ until: households.planOverrideUntil })
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);
    const from = house?.until && house.until.getTime() > now.getTime() ? house.until : now;
    const proUntil = addMonths(from, coupon.months);

    await tx
      .update(households)
      .set({ planOverride: 'pro', planOverrideUntil: proUntil })
      .where(eq(households.id, householdId));

    return { kind: 'redeemed' as const, proUntil };
  });
}
