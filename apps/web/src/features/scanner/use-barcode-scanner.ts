import { useCallback, useEffect, useRef, useState } from 'react';

type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'error';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'] as const;

interface DetectedBarcode {
  rawValue: string;
  format?: string;
}
interface Detector {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

/** Aceita EAN/UPC (8-14 dígitos) ou QR (texto curto, ex.: código/URL do produto). */
function acceptValue(b: DetectedBarcode): boolean {
  if (b.format === 'qr_code') return b.rawValue.length >= 4 && b.rawValue.length <= 512;
  return /^\d{8,14}$/.test(b.rawValue);
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
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const rafRef = useRef<number | null>(null);
  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
    setTorchSupported(false);
    setTorchOn(false);
    setStatus('idle');
  }, []);

  /** Lanterna via constraint avançada do track (Chrome Android; iOS não suporta). */
  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] as unknown as MediaTrackConstraintSet[] });
      setTorchOn(next);
    } catch {
      // dispositivo recusou — ignora
    }
  }, [torchOn]);

  const start = useCallback(async () => {
    setStatus('starting');
    setError(null);
    try {
      const detector = await createDetector();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      // torch só existe em alguns dispositivos (capabilities.torch)
      const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchSupported(!!caps?.torch);
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
            const hit = found.find(acceptValue);
            if (hit) {
              navigator.vibrate?.(60);
              onDetectRef.current(hit.rawValue);
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

  return { videoRef, status, error, torchSupported, torchOn, toggleTorch, start, stop };
}
