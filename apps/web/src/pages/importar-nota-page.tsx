import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NfceReview } from '../features/nfce/nfce-review.js';
import { ScannerModal } from '../features/scanner/scanner-modal.js';
import { Button, Icon } from '../features/ui/index.js';
import { isNfceQr } from '../lib/nfce-import.js';

/**
 * Entrada standalone do import de NFC-e (fora do modo compra): abre o scanner
 * direto; QR que não é nota mostra aviso e deixa escanear de novo.
 */
export function ImportarNotaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scannerOpen, setScannerOpen] = useState(true);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [invalidQr, setInvalidQr] = useState(false);

  function onDetect(raw: string) {
    setScannerOpen(false);
    if (isNfceQr(raw)) {
      setQrUrl(raw);
    } else {
      setInvalidQr(true);
    }
  }

  return (
    <main className="screen-in flex min-h-dvh flex-col items-center justify-center gap-4 px-[18px] py-6">
      {!scannerOpen && !qrUrl && (
        <>
          {invalidQr && (
            <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
              {t('errors.nfce_invalid_qr')}
            </p>
          )}
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              setInvalidQr(false);
              setScannerOpen(true);
            }}
          >
            <Icon name="scan" size={18} /> {t('nfce.scanAgain')}
          </Button>
          <button onClick={() => navigate({ to: '/' })} className="muted text-sm">
            {t('common.cancel')}
          </button>
        </>
      )}

      {scannerOpen && <ScannerModal onDetect={onDetect} onClose={() => navigate({ to: '/' })} />}
      {qrUrl && <NfceReview qrUrl={qrUrl} onClose={() => navigate({ to: '/' })} />}
    </main>
  );
}
