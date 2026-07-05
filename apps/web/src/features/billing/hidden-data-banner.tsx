import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useHiddenCounts } from '../../lib/use-hidden-counts.js';
import { Icon } from '../ui/index.js';

/**
 * Aviso persistente de dados ocultos no downgrade (BILL-01 AC7): conta itens/listas/
 * preços acima do teto free e explica que o Pro os revela (nada foi apagado — só
 * filtrado na leitura, mesmo padrão do historyCutoff). No-op (retorna null) quando
 * não há nada oculto ou a casa é Pro.
 */
export function HiddenDataBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hiddenItems, hiddenLists, total } = useHiddenCounts();

  if (total === 0) return null;

  return (
    <button
      onClick={() => navigate({ to: '/ajustes' })}
      className="card tap flex w-full items-center gap-3 text-left"
      style={{ padding: 14, background: 'var(--app-surface-2)' }}
    >
      <Icon name="spark" size={20} className="flex-none" style={{ color: 'var(--gro-yellow)' }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {t('billing.hiddenBannerTitle', { items: hiddenItems, lists: hiddenLists })}
        </p>
        <p className="muted text-xs">{t('billing.hiddenBannerCta')}</p>
      </div>
      <Icon name="chev" size={18} className="flex-none" style={{ color: 'var(--app-gray)' }} />
    </button>
  );
}
