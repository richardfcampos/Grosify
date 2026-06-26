import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../features/ui/index.js';
import { signIn, signUp } from '../lib/auth-client.js';

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <main
      className="screen-in mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10"
      style={{ background: 'var(--app-bg)', color: 'var(--app-ink)' }}
    >
      <div className="mb-6 flex items-center gap-3">
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            background: 'var(--gro-green)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontFamily: 'var(--gro-font-money)',
            fontSize: 22,
          }}
        >
          G
        </span>
        <span className="text-2xl font-extrabold tracking-tight">Grosify</span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="muted mb-6 mt-1.5 text-sm">{t('auth.subtitle')}</p>
      {children}
    </main>
  );
}

/** Campo com rótulo kicker + input no estilo do design system. */
export function Field({
  label,
  name,
  type = 'text',
  placeholder,
  mono,
  required,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  mono?: boolean;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="kicker mb-1.5 block">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className={`gro-field${mono ? ' gro-field--mono' : ''}`}
      />
    </label>
  );
}

/** Evita redirecionar de volta pra telas de auth (loop). */
function safeRedirect(redirect: string | undefined): string {
  if (!redirect || redirect === '/entrar' || redirect === '/cadastro') return '/';
  return redirect;
}

// Códigos de erro retornados pelos guards anti-abuso (Better Auth client expõe em err.message).
const KNOWN_AUTH_ERRORS = [
  'disposable_email',
  'pwned_password',
  'captcha_failed',
  'account_locked',
  'rate_limited',
];

/** Traduz códigos conhecidos (errors.*); senão usa a mensagem de fallback da tela. */
function authErrorMessage(
  t: (key: string) => string,
  err: { message?: string } | null | undefined,
  fallbackKey: string,
): string {
  const code = err?.message;
  if (typeof code === 'string' && KNOWN_AUTH_ERRORS.includes(code)) return t(`errors.${code}`);
  return t(fallbackKey);
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
    try {
      const { error: err } = await signIn.email({
        email: String(form.get('email')),
        password: String(form.get('password')),
      });
      if (err) {
        setError(authErrorMessage(t, err, 'auth.invalidCredentials'));
        return;
      }
      navigate({ to: safeRedirect(search.redirect) });
    } catch {
      setError(t('auth.networkError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t('auth.loginTitle')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Field label={t('auth.email')} name="email" type="email" placeholder="voce@email.com" mono required />
        <Field label={t('auth.password')} name="password" type="password" placeholder="••••••••" mono required minLength={8} />
        {error && <p className="text-sm" style={{ color: 'var(--gro-red)' }}>{error}</p>}
        <Button variant="primary" size="lg" fullWidth type="submit" disabled={busy} className="mt-1.5">
          {busy ? t('auth.loggingIn') : t('auth.login')}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link to="/esqueci-senha" className="font-bold" style={{ color: 'var(--gro-green)' }}>
          {t('auth.forgotPassword')}
        </Link>
      </p>
      <p className="muted mt-3 text-center text-sm">
        {t('auth.noAccount')}{' '}
        <Link
          to="/cadastro"
          search={{ redirect: search.redirect }}
          className="font-bold"
          style={{ color: 'var(--gro-green)' }}
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
    try {
      const { error: err } = await signUp.email({
        name: String(form.get('name')),
        email: String(form.get('email')),
        password: String(form.get('password')),
        // verificação SOFT: e-mail de confirmação enviado no cadastro; o link
        // redireciona pra esta tela após verificar.
        callbackURL: `${window.location.origin}/verificar-email`,
      });
      if (err) {
        setError(authErrorMessage(t, err, 'auth.signupFailed'));
        return;
      }
      navigate({ to: safeRedirect(search.redirect) });
    } catch {
      setError(t('auth.networkError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t('auth.signupTitle')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Field label={t('auth.name')} name="name" placeholder="ex.: Ana Ribeiro" required />
        <Field label={t('auth.email')} name="email" type="email" placeholder="voce@email.com" mono required />
        <Field label={t('auth.password')} name="password" type="password" placeholder={t('auth.passwordHint')} mono required minLength={8} />
        {error && <p className="text-sm" style={{ color: 'var(--gro-red)' }}>{error}</p>}
        <Button variant="primary" size="lg" fullWidth type="submit" disabled={busy} className="mt-1.5">
          {busy ? t('auth.signingUp') : t('auth.signup')}
        </Button>
      </form>
      <p className="muted mt-5 text-center text-sm">
        {t('auth.hasAccount')}{' '}
        <Link
          to="/entrar"
          search={{ redirect: search.redirect }}
          className="font-bold"
          style={{ color: 'var(--gro-green)' }}
        >
          {t('auth.login')}
        </Link>
      </p>
      <Link to="/privacidade" className="muted mt-3 text-center text-xs underline">
        {t('settings.privacy')}
      </Link>
    </AuthShell>
  );
}
