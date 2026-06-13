import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../lib/auth-client.js';
import { useMembership } from '../lib/use-membership.js';

const buttonClass =
  'w-full rounded-xl bg-green-600 px-4 py-3 text-base font-semibold text-white active:bg-green-700 disabled:opacity-50';

export function CasaPage() {
  const { data: session, isPending } = useSession();
  const membership = useMembership(!!session);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.households.$post({ json: { name } });
      if (!res.ok) throw new Error('falha ao criar casa');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['membership'] }),
    onError: () => setError('Não foi possível criar a casa'),
  });

  if (isPending || (session && membership.isLoading)) return <Loading />;
  if (!session) return <Navigate to="/entrar" search={{ redirect: '/casa' }} />;
  if (membership.data) return <Navigate to="/" />;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name'));
    create.mutate(name);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <h1 className="text-center text-2xl font-bold text-zinc-900">Crie sua casa</h1>
      <p className="text-center text-zinc-600">
        A casa reúne lista, estoque e preços compartilhados com sua família.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          name="name"
          required
          maxLength={100}
          placeholder="Nome da casa (ex.: Casa da Ana)"
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={create.isPending} className={buttonClass}>
          {create.isPending ? 'Criando…' : 'Criar casa'}
        </button>
      </form>
      <p className="text-center text-sm text-zinc-500">
        Recebeu um convite? Abra o link que te enviaram.
      </p>
    </main>
  );
}

export function ConvitePage() {
  const { code } = useParams({ from: '/convite/$code' });
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const join = useMutation({
    mutationFn: async () => {
      const res = await api.households.join.$post({ json: { code } });
      if (res.status === 409) throw new Error('você já faz parte de uma casa');
      if (!res.ok) throw new Error('convite inválido ou expirado');
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-10 text-center">
      <h1 className="text-2xl font-bold text-zinc-900">Convite para uma casa</h1>
      <p className="text-zinc-600">
        Você foi convidado a entrar numa casa no Grosify com o código{' '}
        <span className="font-mono font-semibold">{code}</span>.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button onClick={() => join.mutate()} disabled={join.isPending} className={buttonClass}>
        {join.isPending ? 'Entrando…' : 'Entrar na casa'}
      </button>
    </main>
  );
}

export function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center text-zinc-500">Carregando…</main>
  );
}
