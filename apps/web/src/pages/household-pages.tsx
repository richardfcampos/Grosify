import { defaultCurrencyForLanguage, listCurrencies } from '@grosify/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { useSession } from '../lib/auth-client.js';
import { useMembership } from '../lib/use-membership.js';
import { pendingCount, syncNow } from '../sync/engine.js';
import { Button } from '../features/ui/index.js';

export function CasaPage() {
  const { t, i18n } = useTranslation();
  const { new: isNew } = useSearch({ from: '/casa' });
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const membership = useMembership(!!session);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState(() =>
    defaultCurrencyForLanguage(i18n.resolvedLanguage ?? 'pt'),
  );

  const currencyNames = new Intl.DisplayNames([i18n.resolvedLanguage ?? 'pt'], {
    type: 'currency',
  });

  const create = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.households.$post({ json: { name, currency } });
      if (!res.ok) throw new Error('createFailed');
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['membership'] });
      await queryClient.invalidateQueries({ queryKey: ['householdList'] });
      // a casa nova já é a ativa (servidor); volta pro app — AppLayout re-puxa o cache
      navigate({ to: '/' });
    },
    onError: () => setError(t('household.createFailed')),
  });

  if (isPending || (session && membership.isLoading)) return <Loading />;
  if (!session) return <Navigate to="/entrar" search={{ redirect: '/casa' }} />;
  // multi-casa: com ?new=1 o usuário cria uma casa adicional mesmo já tendo outra
  if (membership.data && !isNew) return <Navigate to="/" />;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name'));
    create.mutate(name);
  }

  return (
    <main className="screen-in mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <h1 className="text-center text-2xl font-bold tracking-tight">{t('household.createTitle')}</h1>
      <p className="muted text-center">{t('household.createSubtitle')}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          name="name"
          required
          maxLength={100}
          placeholder={t('household.namePlaceholder')}
          aria-label={t('household.namePlaceholder')}
          className="gro-field"
        />
        <label className="muted flex flex-col gap-1 text-sm font-medium">
          {t('household.currency')}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="gro-field font-normal"
            style={{ color: 'var(--app-ink)' }}
          >
            {listCurrencies().map((code) => (
              <option key={code} value={code}>
                {code} — {currencyNames.of(code) ?? code}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
            {error}
          </p>
        )}
        <Button variant="primary" size="lg" fullWidth type="submit" disabled={create.isPending}>
          {create.isPending ? t('household.creating') : t('household.create')}
        </Button>
      </form>
      <p className="muted text-center text-sm">{t('household.inviteHint')}</p>
    </main>
  );
}

export function ConvitePage() {
  const { t } = useTranslation();
  const { code } = useParams({ from: '/convite/$code' });
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // token (convite por e-mail, >8 chars) vs código humano (8 chars)
  const isToken = code.length > 8;

  const preview = useQuery({
    queryKey: ['invite', code],
    enabled: !!session,
    retry: false,
    queryFn: async () => {
      const res = await api.households.invites[':value'].$get({ param: { value: code } });
      if (!res.ok) throw new Error('invalid');
      return res.json();
    },
  });

  const join = useMutation({
    mutationFn: async () => {
      // se já tem casa com mudanças offline pendentes, drena antes — entrar numa nova
      // casa troca a casa ativa e zera o cache local
      await syncNow();
      if ((await pendingCount()) > 0) throw new Error(t('household.switchPending'));
      const res = await api.households.join.$post({
        json: isToken ? { token: code } : { code },
      });
      if (res.status === 409) throw new Error(t('errors.already_in_household'));
      if (res.status === 403) throw new Error(t('errors.invite_email_mismatch'));
      if (!res.ok) throw new Error(t('errors.invalid_invite'));
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['membership'] });
      navigate({ to: '/' });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isPending) return <Loading />;
  if (!session) {
    return <Navigate to="/cadastro" search={{ redirect: `/convite/${code}` }} />;
  }
  if (preview.isLoading) return <Loading />;

  const inv = preview.data;
  const invalid = preview.isError || !inv;
  const mismatch = !!inv && inv.requiresEmail && !inv.emailMatches;

  return (
    <main className="screen-in mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-10 text-center">
      <h1 className="text-2xl font-bold tracking-tight">{t('household.inviteTitle')}</h1>
      {invalid ? (
        <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
          {t('errors.invalid_invite')}
        </p>
      ) : (
        <>
          <p className="text-lg font-semibold">
            {t('household.inviteByName', { inviter: inv.invitedByName })}
          </p>
          <p className="muted">{t('household.inviteToHousehold', { household: inv.householdName })}</p>
          {mismatch && (
            <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
              {t('household.inviteMismatch')}
            </p>
          )}
          {error && (
            <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
              {error}
            </p>
          )}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => join.mutate()}
            disabled={join.isPending || mismatch}
          >
            {join.isPending ? t('household.joining') : t('household.join')}
          </Button>
        </>
      )}
    </main>
  );
}

export function Loading() {
  const { t } = useTranslation();
  return (
    <main className="muted flex min-h-dvh items-center justify-center">
      {t('common.loading')}
    </main>
  );
}
