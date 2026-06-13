import { useCallback, useEffect, useRef, useState } from 'react';

type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'error';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

interface DetectedBarcode {
  rawValue: string;
}
interface Detector {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

/** BarcodeDetector nativo (Chrome Android) quando há; senão polyfill ZXing-wasm. */
async function createDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: new (o: unknown) => Detector }).BarcodeDetector;
  if (native) return new native({ formats: FORMATS });
  const { BarcodeDetector } = await import('barcode-detector/ponyfill');
  return new BarcodeDetector({ formats: [...FORMATS] });
}

export function useBarcodeScanner(onDetect: (barcode: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    setStatus('starting');
    setError(null);
    try {
      const detector = await createDetector();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      setStatus('scanning');

      let busy = false;
      const tick = async () => {
        if (!streamRef.current) return;
        if (!busy && video.readyState >= 2) {
          busy = true;
          try {
            const found = await detector.detect(video);
            const value = found[0]?.rawValue;
            if (value && /^\d{8,14}$/.test(value)) {
              onDetectRef.current(value);
              stop();
              return;
            }
          } catch {
            // frame falhou — ignora e tenta o próximo
          }
          busy = false;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setStatus('error');
      setError('camera_unavailable');
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { videoRef, status, error, start, stop };
}
