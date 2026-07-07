import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api.js';
import { useConfirm } from '../../lib/confirm.js';
import { useHouseholdCurrency, useHouseholdPlan } from '../../lib/use-currency.js';
import { Badge } from '../ui/index.js';
import { couponErrorKey, CouponRedeemForm } from './coupon-redeem-form.js';
import { checkoutErrorKey, PlanCheckoutForm } from './plan-checkout-form.js';
import { PlanStatusCard, type Subscription } from './plan-status-card.js';

/**
 * Substitui o CTA morto de Ajustes (BILL-05): free vê comparativo + preços + CPF/CNPJ
 * + botões mensal/anual → redirect pro checkout hosted (PlanCheckoutForm); pro vê
 * status/ciclo/próxima cobrança/cancelar (PlanStatusCard). planOverride (pro sem
 * subscription) aparece como pro "puro", sem controles de cancelamento — não há
 * assinatura pra cancelar no provider.
 *
 * Retorno do checkout: o QueryClient global (main.tsx) já tem staleTime=30s sem
 * refetchOnWindowFocus sobrescrito (default do react-query é true) — a volta do
 * redirect externo dispara o evento focus da window e o react-query refaz a query
 * de membership sozinho. Cancel invalida explicitamente as duas queries afetadas.
 */
export function PlanSection() {
  const { t, i18n } = useTranslation();
  const plan = useHouseholdPlan();
  const currency = useHouseholdCurrency();
  const locale = i18n.resolvedLanguage ?? 'pt';
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccess, setCouponSuccess] = useState<string | null>(null);

  const subscription = useQuery({
    queryKey: ['billingSubscription'],
    enabled: plan === 'pro',
    queryFn: async (): Promise<Subscription | null> => {
      const res = await api.billing.subscription.$get();
      if (!res.ok) return null;
      const data = await res.json();
      return data.subscription as Subscription | null;
    },
  });

  const checkout = useMutation({
    mutationFn: async ({ cycle, cpfCnpj }: { cycle: 'monthly' | 'yearly'; cpfCnpj: string }) => {
      const res = await api.billing.checkout.$post({ json: { cycle, cpfCnpj } });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(checkoutErrorKey(res.status, body));
      }
      return res.json();
    },
    onSuccess: (data) => {
      setCheckoutError(null);
      window.location.href = data.checkoutUrl;
    },
    onError: (e: Error) => setCheckoutError(t(e.message, { defaultValue: t('errors.generic') })),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await api.billing.cancel.$post();
      if (!res.ok) throw new Error('cancelFailed');
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['membership'] });
      await queryClient.invalidateQueries({ queryKey: ['billingSubscription'] });
    },
  });

  const redeem = useMutation({
    mutationFn: async (code: string): Promise<{ proUntil: string }> => {
      const res = await api.billing['redeem-coupon'].$post({ json: { code } });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(couponErrorKey(res.status, body));
      }
      return res.json();
    },
    onSuccess: async (data) => {
      setCouponError(null);
      // "Pro até <data>" no locale da UI — invalida membership pro plano efetivo atualizar.
      const until = new Date(data.proUntil).toLocaleDateString(locale);
      setCouponSuccess(t('billing.couponSuccess', { date: until }));
      await queryClient.invalidateQueries({ queryKey: ['membership'] });
      await queryClient.invalidateQueries({ queryKey: ['billingSubscription'] });
    },
    onError: (e: Error) => {
      setCouponSuccess(null);
      setCouponError(t(e.message, { defaultValue: t('errors.generic') }));
    },
  });

  async function onCancel() {
    const ok = await confirm({
      title: t('billing.cancelConfirmTitle'),
      message: t('billing.cancelConfirmMessage'),
      confirmLabel: t('billing.cancelConfirmCta'),
      danger: true,
    });
    if (ok) cancel.mutate();
  }

  // Pro sem subscription carregada ainda (query em andamento) ou planOverride puro
  // (nenhuma linha de subscription no servidor) — mostra badge pro sem controles.
  const hasManagedSubscription = plan === 'pro' && subscription.data != null;

  return (
    <div className="card flex flex-col gap-2.5" style={{ padding: 16 }}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">{plan === 'pro' ? t('billing.proName') : t('billing.freeName')}</span>
        <Badge tone={plan === 'pro' ? 'oferta' : 'neutral'}>
          {plan === 'pro' ? t('billing.proName') : t('billing.freeName')}
        </Badge>
      </div>

      {plan === 'free' && (
        <PlanCheckoutForm
          currency={currency}
          locale={locale}
          pending={checkout.isPending}
          error={checkoutError}
          onSubmit={(cycle, cpfCnpj) => checkout.mutate({ cycle, cpfCnpj })}
        />
      )}

      {plan === 'pro' && !hasManagedSubscription && !subscription.isLoading && (
        <p className="muted text-sm">{t('billing.proOverride')}</p>
      )}

      {hasManagedSubscription && subscription.data && (
        <PlanStatusCard
          subscription={subscription.data}
          locale={locale}
          cancelPending={cancel.isPending}
          onCancel={onCancel}
        />
      )}

      {/* Cupom de meses grátis — free E pro (pro empilha). Separador visual do bloco acima. */}
      <div className="mt-1 border-t pt-3" style={{ borderColor: 'var(--gro-border)' }}>
        <CouponRedeemForm
          pending={redeem.isPending}
          error={couponError}
          successMessage={couponSuccess}
          onSubmit={(code) => redeem.mutate(code)}
        />
      </div>
    </div>
  );
}
