import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { signIn, signUp } from '../lib/auth-client.js';

function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-2">
        <img src="/icon.svg" alt="" className="h-14 w-14" />
        <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
      </div>
      {children}
    </main>
  );
}

const inputClass =
  'w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100';
const buttonClass =
  'w-full rounded-xl bg-green-600 px-4 py-3 text-base font-semibold text-white active:bg-green-700 disabled:opacity-50';

export function EntrarPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/entrar' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const { error: err } = await signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
    setBusy(false);
    if (err) {
      setError('E-mail ou senha incorretos');
      return;
    }
    navigate({ to: search.redirect ?? '/' });
  }

  return (
    <AuthShell title="Entrar no Grosify">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="E-mail" className={inputClass} />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="Senha"
          className={inputClass}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="text-center text-sm text-zinc-600">
        Não tem conta?{' '}
        <Link
          to="/cadastro"
          search={{ redirect: search.redirect }}
          className="font-semibold text-green-700"
        >
          Criar conta
        </Link>
      </p>
    </AuthShell>
  );
}

export function CadastroPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/cadastro' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const { error: err } = await signUp.email({
      name: String(form.get('name')),
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
    setBusy(false);
    if (err) {
      setError(err.message ?? 'Não foi possível criar a conta');
      return;
    }
    navigate({ to: search.redirect ?? '/' });
  }

  return (
    <AuthShell title="Criar conta">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input name="name" required placeholder="Seu nome" className={inputClass} />
        <input name="email" type="email" required placeholder="E-mail" className={inputClass} />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="Senha (mínimo 8 caracteres)"
          className={inputClass}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
      <p className="text-center text-sm text-zinc-600">
        Já tem conta?{' '}
        <Link
          to="/entrar"
          search={{ redirect: search.redirect }}
          className="font-semibold text-green-700"
        >
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}
