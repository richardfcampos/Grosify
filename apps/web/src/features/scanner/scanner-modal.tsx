import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useBarcodeScanner } from './use-barcode-scanner.js';

interface Props {
  onDetect: (barcode: string) => void;
  onClose: () => void;
}

/** Modal de scanner: câmera (uma mão) com fallback manual sempre disponível. */
export function ScannerModal({ onDetect, onClose }: Props) {
  const { t } = useTranslation();
  const { videoRef, status, error, torchSupported, torchOn, toggleTorch, start, stop } =
    useBarcodeScanner((code) => {
      onDetect(code);
      onClose();
    });
  const [manual, setManual] = useState('');

  useEffect(() => {
    start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitManual(e: FormEvent) {
    e.preventDefault();
    if (/^\d{8,14}$/.test(manual)) {
      onDetect(manual);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-950 text-stone-50">
      <header className="flex items-center justify-between px-5 py-4">
        <h2 className="text-lg font-semibold">{t('scanner.title')}</h2>
        <button onClick={onClose} className="min-h-11 px-3 text-sm font-medium text-stone-300">
          {t('common.cancel')}
        </button>
      </header>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {status === 'scanning' && (
          <div className="pointer-events-none absolute inset-x-10 top-1/2 h-32 -translate-y-1/2 rounded-2xl border-4 border-yellow-400/90" />
        )}
        {torchSupported && (
          <button
            onClick={toggleTorch}
            aria-label={t('scanner.torch')}
            className={`absolute bottom-4 left-1/2 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full text-2xl ${
              torchOn ? 'bg-yellow-400 text-stone-900' : 'bg-stone-800/90 text-stone-100'
            }`}
          >
            🔦
          </button>
        )}
        {error && (
          <p className="absolute inset-x-6 top-6 rounded-xl bg-red-950 px-4 py-3 text-sm text-red-300">
            {t('scanner.cameraError')}
          </p>
        )}
      </div>

      <form onSubmit={submitManual} className="flex flex-col gap-2 px-5 py-4">
        <label className="text-sm text-stone-300">{t('scanner.manualLabel')}</label>
        <div className="flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder={t('scanner.manualPlaceholder')}
            className="min-h-12 flex-1 rounded-xl border border-stone-700 bg-stone-900 px-4 py-3 text-base text-stone-50 outline-none focus:border-yellow-400"
          />
          <button
            type="submit"
            disabled={!/^\d{8,14}$/.test(manual)}
            className="min-h-12 rounded-xl bg-yellow-400 px-5 font-semibold text-stone-900 disabled:opacity-40"
          >
            {t('common.add')}
          </button>
        </div>
      </form>
    </div>
  );
}
