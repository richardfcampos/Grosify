import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaywallSheet } from '../billing/paywall-sheet.js';
import {
  lookupNfce,
  NfceImportError,
  type NfceLookupResult,
} from '../../lib/nfce-import.js';

interface Props {
  qrUrl: string;
  onClose: () => void;
}

/**
 * Tela de revisão do import de NFC-e: escaneou → consulta o lookup → revisa
 * itens matcheados/novos/ignorados → confirma. T11 entrega o esqueleto
 * (loading/erro/quota); a revisão linha-a-linha completa é da T12.
 */
export function NfceReview({ qrUrl, onClose }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [result, setResult] = useState<NfceLookupResult | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    let alive = true;
    setState('loading');
    lookupNfce(qrUrl)
      .then((r) => {
        if (!alive) return;
        setResult(r);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (!alive) return;
        if (err instanceof NfceImportError) {
          if (err.code === 'nfce_quota_free') {
            setShowPaywall(true);
            return;
          }
          setErrorCode(err.code);
        } else {
          setErrorCode('generic');
        }
        setState('error');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrUrl]);

  if (showPaywall) {
    return <PaywallSheet feature="nfce" onClose={onClose} />;
  }

  return (
    <div className="gro-sheet-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="gro-sheet-panel flex flex-col gap-3">
        <div className="gro-sheet-grip" />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('nfce.reviewTitle')}</h2>
          <button onClick={onClose} className="muted text-sm">
            {t('common.cancel')}
          </button>
        </div>

        {state === 'loading' && <p className="muted text-sm">{t('nfce.loading')}</p>}

        {state === 'error' && (
          <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
            {t(`errors.${errorCode}`)}
          </p>
        )}

        {state === 'ready' && result && (
          <NfceReviewBody result={result} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

/** Corpo da revisão (lista de linhas + loja + confirmar) — implementado na T12/T13. */
function NfceReviewBody({ result }: { result: NfceLookupResult; onClose: () => void }) {
  const { t } = useTranslation();
  if (result.alreadyImported) {
    return <p className="muted text-sm">{t('nfce.alreadyImported')}</p>;
  }
  return (
    <p className="muted text-sm">
      {t('nfce.itemsFound', { count: result.lines.length })}
    </p>
  );
}
