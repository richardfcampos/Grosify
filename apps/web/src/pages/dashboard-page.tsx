import { useMutation } from '@tanstack/react-query';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../lib/api.js';
import { signOut, useSession } from '../lib/auth-client.js';
import { useMembership } from '../lib/use-membership.js';
import { Loading } from './household-pages.js';

export function DashboardPage() {
  const { data: session, isPending } = useSession();
  const membership = useMembership(!!session);
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: async () => {
      const res = await api.households.invites.$post();
      if (!res.ok) throw new Error('falha ao gerar convite');
      return res.json();
    },
    onSuccess: (data) => setInviteCode(data.code),
  });

  if (isPending || (session && membership.isLoading)) return <Loading />;
  if (!session) return <Navigate to="/entrar" search={{ redirect: '/' }} />;
  if (!membership.data) return <Navigate to="/casa" />;

  const inviteUrl = inviteCode ? `${window.location.origin}/convite/${inviteCode}` : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-bold text-zinc-900">{membership.data.name}</h1>
            <p className="text-xs text-zinc-500">
              Plano {membership.data.plan === 'free' ? 'Grátis' : 'Pro'}
            </p>
          </div>
        </div>
        <button
          onClick={async () => {
            await signOut();
            navigate({ to: '/entrar', search: { redirect: undefined } });
          }}
          className="text-sm font-medium text-zinc-500"
        >
          Sair
        </button>
      </header>

      <section className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-zinc-500">
        <p className="font-medium">Sua casa está pronta 🎉</p>
        <p className="mt-1 text-sm">Itens, lista e preços chegam nas próximas fases.</p>
      </section>

      <section className="rounded-2xl border border-zinc-200 p-5">
        <h2 className="font-semibold text-zinc-900">Convidar alguém</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Quem entrar pelo link compartilha lista, estoque e preços desta casa.
        </p>
        {inviteUrl ? (
          <div className="mt-3 flex flex-col gap-2">
            <code className="break-all rounded-lg bg-zinc-100 px-3 py-2 text-sm">{inviteUrl}</code>
            <button
              onClick={() => navigator.clipboard.writeText(inviteUrl)}
              className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Copiar link
            </button>
          </div>
        ) : (
          <button
            onClick={() => invite.mutate()}
            disabled={invite.isPending}
            className="mt-3 w-full rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-green-700 disabled:opacity-50"
          >
            {invite.isPending ? 'Gerando…' : 'Gerar link de convite'}
          </button>
        )}
      </section>
    </main>
  );
}
