import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../features/ui/index.js';
import { Turnstile, turnstileEnabled } from '../features/auth/turnstile.js';
import { requestPasswordReset, resetPassword } from '../lib/auth-client.js';
import { AuthShell, Field } from './auth-pages.js';

/** Pede o link de recuperação. SEMPRE mostra sucesso genérico (anti-enumeration). */
export function EsqueciSenhaPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tsToken, setTsToken] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const email = String(new FormData(e.currentTarget).get('email'));
    try {
      // Resposta é genérica no servidor; ignoramos o resultado de propósito (não
      // revela se a conta existe). Só erro de REDE vira mensagem.
      await requestPasswordReset(
        { email, redirectTo: `${window.location.origin}/redefinir-senha` },
        { headers: { 'x-turnstile-token': tsToken } },
      );
      setSent(true);
    } catch {
      setError(t('auth.networkError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t('auth.forgotTitle')}>
      {sent ? (
        <p className="text-sm" style={{ color: 'var(--app-ink)' }}>
          {t('auth.forgotSent')}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          <Field label={t('auth.email')} name="email" type="email" placeholder="voce@email.com" mono required />
          <Turnstile onToken={setTsToken} />
          {error && (
            <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
              {error}
            </p>
          )}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            type="submit"
            disabled={busy || (turnstileEnabled && !tsToken)}
            className="mt-1.5"
          >
            {busy ? t('auth.sending') : t('auth.forgotCta')}
          </Button>
        </form>
      )}
      <p className="muted mt-5 text-center text-sm">
        <Link to="/entrar" className="font-bold" style={{ color: 'var(--gro-green)' }}>
          {t('auth.backToLogin')}
        </Link>
      </p>
    </AuthShell>
  );
}

/** Define a nova senha a partir do token do link. */
export function RedefinirSenhaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useSearch({ from: '/redefinir-senha' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) {
      setError(t('auth.resetInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    const newPassword = String(new FormData(e.currentTarget).get('password'));
    try {
      const { error: err } = await resetPassword({ newPassword, token });
      if (err) {
        setError(t('auth.resetInvalid'));
        return;
      }
      navigate({ to: '/entrar', search: { redirect: undefined } });
    } catch {
      setError(t('auth.networkError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t('auth.resetTitle')}>
      {token ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          <Field
            label={t('auth.newPassword')}
            name="password"
            type="password"
            placeholder={t('auth.passwordHint')}
            mono
            required
            minLength={8}
          />
          {error && (
            <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
              {error}
            </p>
          )}
          <Button variant="primary" size="lg" fullWidth type="submit" disabled={busy} className="mt-1.5">
            {busy ? t('auth.saving') : t('auth.resetCta')}
          </Button>
        </form>
      ) : (
        <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
          {t('auth.resetInvalid')}
        </p>
      )}
      <p className="muted mt-5 text-center text-sm">
        <Link to="/entrar" className="font-bold" style={{ color: 'var(--gro-green)' }}>
          {t('auth.backToLogin')}
        </Link>
      </p>
    </AuthShell>
  );
}

/** Tela de destino após o link de verificação (Better Auth verifica no servidor e redireciona). */
export function VerificarEmailPage() {
  const { t } = useTranslation();
  const { error } = useSearch({ from: '/verificar-email' });

  return (
    <AuthShell title={t('auth.verifyTitle')}>
      {error ? (
        <>
          <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
            {t('auth.verifyFailed')}
          </p>
          <p className="muted mt-5 text-center text-sm">
            <Link to="/entrar" className="font-bold" style={{ color: 'var(--gro-green)' }}>
              {t('auth.backToLogin')}
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="text-sm" style={{ color: 'var(--app-ink)' }}>
            {t('auth.verifySuccess')}
          </p>
          <Link to="/" className="mt-5 block">
            <Button variant="primary" size="lg" fullWidth>
              {t('auth.goToApp')}
            </Button>
          </Link>
        </>
      )}
    </AuthShell>
  );
}
