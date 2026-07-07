import { and, desc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../db/index.js';
import { households, subscriptions, webhookEvents } from '../db/schema.js';
import type { BillingEvent, ProviderName } from './types.js';

/** Grace de inadimplência: Pro se mantém até 7 dias em `overdue`. */
const OVERDUE_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resultado discriminado de applyBillingEvent — pra log/observabilidade e testes.
 *   applied                     → evento novo mudou o estado
 *   duplicate                   → mesmo (provider,eventId) já processado; no-op
 *   unknown_subscription        → externalId sem linha correspondente; no-op
 *   ignored_terminal            → assinatura já canceled (terminal); guarda out-of-order
 *   ignored_invalid_transition  → transição não prevista pro status atual; no-op + log
 */
export type ApplyResult =
  | 'applied'
  | 'duplicate'
  | 'unknown_subscription'
  | 'ignored_terminal'
  | 'ignored_invalid_transition';

type SubStatus = 'pending' | 'active' | 'overdue' | 'canceled';

/**
 * Aplica um evento de billing normalizado. Idempotente por (provider,eventId):
 * o segundo idêntico é no-op. Localiza a assinatura pelo externalId, roda a máquina
 * de estados e sincroniza households.plan. Nunca lança por transição inválida —
 * retorna um resultado que o handler loga (a fila de webhook não pode ser interrompida).
 */
export async function applyBillingEvent(
  evt: BillingEvent,
  provider: ProviderName,
): Promise<ApplyResult> {
  // (1) Idempotência: insere o evento; conflito (provider,eventId) = já visto → no-op.
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: uuidv7(), provider, eventId: evt.eventId, type: evt.type })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) return 'duplicate';

  // (2) Localiza a assinatura pelo par (provider, externalId).
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.provider, provider),
        eq(subscriptions.externalId, evt.externalSubscriptionId),
      ),
    )
    .limit(1);
  if (!sub) return 'unknown_subscription';

  // (3) Canceled é terminal — ignora tudo (guarda contra eventos fora de ordem).
  if (sub.status === 'canceled') return 'ignored_terminal';

  const now = new Date();
  const next = nextState(sub.status as SubStatus, evt.type);
  if (!next) {
    console.warn(
      `[billing:lifecycle] transição inválida ignorada: ${sub.status} + ${evt.type} (sub=${sub.id})`,
    );
    return 'ignored_invalid_transition';
  }

  await db
    .update(subscriptions)
    .set({ ...next.patch(now), updatedAt: now })
    .where(eq(subscriptions.id, sub.id));

  // (4) Sincroniza households.plan com o novo status.
  await syncHouseholdPlan(sub.householdId, next.status, next.currentPeriodEnd(sub.currentPeriodEnd), now);

  return 'applied';
}

interface Transition {
  status: SubStatus;
  patch: (now: Date) => Partial<typeof subscriptions.$inferInsert>;
  currentPeriodEnd: (existing: Date | null) => Date | null;
}

/**
 * Máquina de estados. Retorna a transição ou null (transição não prevista). canceled
 * nunca chega aqui (tratado antes como terminal).
 */
function nextState(status: SubStatus, type: BillingEvent['type']): Transition | null {
  const toCanceled: Transition = {
    status: 'canceled',
    // currentPeriodEnd mantém se já existir (Pro até o fim do pago); senão fecha agora.
    patch: (now) => ({ status: 'canceled', canceledAt: now }),
    currentPeriodEnd: (existing) => existing,
  };

  if (type === 'payment_refunded' || type === 'chargeback' || type === 'subscription_deleted') {
    return toCanceled;
  }

  if (type === 'payment_confirmed') {
    // pending→active e overdue→active; active→active (re-confirmação idempotente).
    // Sempre limpa overdueSince ao confirmar.
    return {
      status: 'active',
      patch: () => ({ status: 'active', overdueSince: null }),
      currentPeriodEnd: (existing) => existing,
    };
  }

  if (type === 'payment_overdue') {
    // Só faz sentido a partir de active/overdue; pending não tem cobrança vencida.
    if (status === 'pending') return null;
    return {
      status: 'overdue',
      // Marca overdueSince na 1ª vez; re-overdue não reinicia o relógio do grace.
      patch: (now) => (status === 'overdue' ? {} : { status: 'overdue', overdueSince: now }),
      currentPeriodEnd: (existing) => existing,
    };
  }

  return null;
}

/**
 * Materializa households.plan a partir do status da assinatura:
 *   active                                   → pro
 *   overdue                                  → pro (grace; lazy expiry decide o flip)
 *   canceled com período pago ainda vigente  → pro; senão → free
 */
async function syncHouseholdPlan(
  householdId: string,
  status: SubStatus,
  currentPeriodEnd: Date | null,
  now: Date,
): Promise<void> {
  let plan: 'free' | 'pro';
  if (status === 'active' || status === 'overdue') {
    plan = 'pro';
  } else {
    // canceled: Pro só enquanto o período pago não expirou.
    plan = currentPeriodEnd && currentPeriodEnd > now ? 'pro' : 'free';
  }
  await db.update(households).set({ plan }).where(eq(households.id, householdId));
}

/**
 * Plano efetivo do household com expiração preguiçosa (write-behind, sem cron):
 *   - planOverride ('pro') vence quando vigente: planOverrideUntil null (permanente,
 *     comp manual) ou futuro (cupom de meses ainda válido).
 *   - assinatura canceled com currentPeriodEnd já vencido → deve ser free.
 *   - assinatura overdue há mais de 7 dias → deve ser free.
 * Quando o plan materializado está desatualizado (ainda 'pro' num desses casos), corrige
 * o banco na leitura e retorna 'free'. Exportado pra membershipOf usar (fase 3).
 *
 * Override expirado (planOverrideUntil < now) NÃO é limpo — só ignorado; mantém o histórico
 * do que foi concedido (via cupom/comp) e segue pro fluxo normal de assinatura.
 */
export async function resolveEffectivePlan(householdId: string): Promise<'free' | 'pro'> {
  const [house] = await db
    .select({
      plan: households.plan,
      planOverride: households.planOverride,
      planOverrideUntil: households.planOverrideUntil,
    })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  if (!house) return 'free';
  // Override vigente = 'pro' com until null (permanente) ou ainda futuro.
  if (
    house.planOverride === 'pro' &&
    (house.planOverrideUntil == null || house.planOverrideUntil > new Date())
  ) {
    return 'pro';
  }

  // Assinatura não-terminal mais recente (se houver).
  const [sub] = await db
    .select({
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      overdueSince: subscriptions.overdueSince,
    })
    .from(subscriptions)
    .where(eq(subscriptions.householdId, householdId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const now = new Date();
  const expired =
    !!sub &&
    ((sub.status === 'canceled' &&
      (sub.currentPeriodEnd == null || sub.currentPeriodEnd < now)) ||
      (sub.status === 'overdue' &&
        sub.overdueSince != null &&
        sub.overdueSince.getTime() + OVERDUE_GRACE_DAYS * DAY_MS < now.getTime()));

  if (house.plan === 'pro' && expired) {
    // Write-behind: corrige o materializado na leitura, sem cron.
    await db.update(households).set({ plan: 'free' }).where(eq(households.id, householdId));
    return 'free';
  }

  return house.plan;
}
