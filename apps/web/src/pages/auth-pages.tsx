import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
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

/** Evita redirecionar de volta pra telas de auth (loop). */
function safeRedirect(redirect: string | undefined): string {
  if (!redirect || redirect === '/entrar' || redirect === '/cadastro') return '/';
  return redirect;
}

export function EntrarPage() {
  const { t } = useTranslation();
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
      setError(t('auth.invalidCredentials'));
      return;
    }
    navigate({ to: safeRedirect(search.redirect) });
  }

  return (
    <AuthShell title={t('auth.loginTitle')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder={t('auth.email')}
          className={inputClass}
        />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder={t('auth.password')}
          className={inputClass}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? t('auth.loggingIn') : t('auth.login')}
        </button>
      </form>
      <p className="text-center text-sm text-zinc-600">
        {t('auth.noAccount')}{' '}
        <Link
          to="/cadastro"
          search={{ redirect: search.redirect }}
          className="font-semibold text-green-700"
        >
          {t('auth.signup')}
        </Link>
      </p>
    </AuthShell>
  );
}

export function CadastroPage() {
  const { t } = useTranslation();
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
      setError(err.message ?? t('auth.signupFailed'));
      return;
    }
    navigate({ to: safeRedirect(search.redirect) });
  }

  return (
    <AuthShell title={t('auth.signupTitle')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input name="name" required placeholder={t('auth.name')} className={inputClass} />
        <input
          name="email"
          type="email"
          required
          placeholder={t('auth.email')}
          className={inputClass}
        />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder={t('auth.passwordHint')}
          className={inputClass}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? t('auth.signingUp') : t('auth.signup')}
        </button>
      </form>
      <p className="text-center text-sm text-zinc-600">
        {t('auth.hasAccount')}{' '}
        <Link
          to="/entrar"
          search={{ redirect: search.redirect }}
          className="font-semibold text-green-700"
        >
          {t('auth.login')}
        </Link>
      </p>
      <Link to="/privacidade" className="text-center text-xs text-zinc-400 underline">
        {t('settings.privacy')}
      </Link>
    </AuthShell>
  );
}
