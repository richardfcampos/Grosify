import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { recognizePrice } from '../../lib/ocr-price.js';

interface Props {
  onDetect: (price: string) => void;
  onClose: () => void;
}

type Status = 'starting' | 'ready' | 'reading' | 'error' | 'notfound';

/** Modal de câmera que lê o valor da etiqueta (OCR). O usuário confirma o valor lido. */
export function PriceScanModal({ onDetect, onClose }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>('starting');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((tk) => tk.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('ready');
      } catch {
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tk) => tk.stop());
    };
  }, []);

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setStatus('reading');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    try {
      const price = await recognizePrice(canvas);
      if (price) {
        navigator.vibrate?.(60);
        onDetect(price);
        onClose();
      } else {
        setStatus('notfound');
      }
    } catch {
      setStatus('notfound');
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-stone-950 text-stone-50">
      <header className="flex items-center justify-between px-5 py-4">
        <h2 className="text-lg font-semibold">{t('priceScan.title')}</h2>
        <button onClick={onClose} className="min-h-11 px-3 text-sm font-medium text-stone-300">
          {t('common.cancel')}
        </button>
      </header>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-12 top-1/2 h-20 -translate-y-1/2 rounded-2xl border-4 border-yellow-400/90" />
        {status === 'error' && (
          <p className="absolute inset-x-6 top-6 rounded-xl bg-red-950 px-4 py-3 text-sm text-red-300">
            {t('priceScan.cameraError')}
          </p>
        )}
        {status === 'notfound' && (
          <p className="absolute inset-x-6 top-6 rounded-xl bg-amber-950 px-4 py-3 text-sm text-amber-200">
            {t('priceScan.notFound')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 px-5 py-4">
        <p className="text-center text-sm text-stone-400">{t('priceScan.hint')}</p>
        <button
          onClick={capture}
          disabled={status === 'starting' || status === 'reading' || status === 'error'}
          className="min-h-12 rounded-xl bg-yellow-400 font-bold text-stone-900 disabled:opacity-50"
        >
          {status === 'reading' ? t('priceScan.reading') : t('priceScan.capture')}
        </button>
      </div>
    </div>
  );
}
