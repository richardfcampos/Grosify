import { parsePriceTag } from '@grosify/shared';
import type { Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

/** Worker do Tesseract carregado sob demanda (lazy) — fica fora do bundle inicial. */
async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      await worker.setParameters({ tessedit_char_whitelist: '0123456789.,R$ ' });
      return worker;
    })();
  }
  return workerPromise;
}

/** OCR de um frame (canvas) → string de preço pra parseToMinorUnits, ou null. */
export async function recognizePrice(canvas: HTMLCanvasElement): Promise<string | null> {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  return parsePriceTag(data.text);
}
