import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/index.js';

/** Mapeia erro HTTP do resgate pro código de tradução (mesmo padrão inline vermelho do checkout). */
export function couponErrorKey(status: number, body: { error?: string }): string {
  if (status === 429) return 'errors.rate_limited';
  if (body.error) return `errors.${body.error}`;
  return 'errors.generic';
}

interface Props {
  pending: boolean;
  error: string | null;
  /** "Pro até X" — mensagem de sucesso já formatada no locale; null quando ainda sem resgate. */
  successMessage: string | null;
  onSubmit: (code: string) => void;
}

/** Campo "tenho um cupom" — visível pra free E pro (pro empilha meses). Bloco do PlanSection. */
export function CouponRedeemForm({ pending, error, successMessage, onSubmit }: Props) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const trimmed = code.trim();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (trimmed.length > 0) onSubmit(trimmed);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="kicker">{t('billing.couponLabel')}</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('billing.couponPlaceholder')}
          className="gro-field gro-field--mono"
          autoCapitalize="characters"
        />
      </label>

      <Button variant="secondary" size="md" fullWidth disabled={trimmed.length === 0 || pending} type="submit">
        {t('billing.couponRedeem')}
      </Button>

      {successMessage && (
        <p className="text-sm" style={{ color: 'var(--gro-green)' }}>
          {successMessage}
        </p>
      )}
      {error && (
        <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
          {error}
        </p>
      )}
    </form>
  );
}
