import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/index.js';
import { PaywallSheet } from '../billing/paywall-sheet.js';

/**
 * Badge neutro "acaba em ~Nd" da previsão de reposição. Tom neutral por DESIGN.md
 * (cor só em eventos de dinheiro — previsão não é preço). Só renderiza com previsão.
 */
export function ForecastBadge({ daysLeft }: { daysLeft: number | undefined }) {
  const { t } = useTranslation();
  if (daysLeft == null) return null;
  return (
    <Badge tone="neutral" style={{ fontSize: 10 }}>
      {t('forecast.daysLeft', { count: daysLeft })}
    </Badge>
  );
}

/**
 * Teaser discreto pro plano free: uma linha "Previsão de reposição — Pro" que abre
 * o PaywallSheet('forecast'). Não computa/vaza nenhum número — só o convite.
 */
export function ForecastTeaser() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="muted flex items-center gap-1.5 self-start text-[12.5px] font-semibold"
      >
        {t('forecast.teaser')}
      </button>
      {open && <PaywallSheet feature="forecast" onClose={() => setOpen(false)} />}
    </>
  );
}
