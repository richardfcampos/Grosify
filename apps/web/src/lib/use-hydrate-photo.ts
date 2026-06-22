import { useEffect } from 'react';
import { hydrateItemPhoto, hydrateSessionReceipt } from './uploads.js';

/** Tem key remota mas não tem blob local → baixa do R2 pro cache (Dexie reativo mostra). */
export function useHydrateItemPhoto(
  id: string,
  photoKey: string | null | undefined,
  blob: Blob | null | undefined,
): void {
  useEffect(() => {
    if (!blob && photoKey) void hydrateItemPhoto(id, photoKey);
  }, [id, photoKey, blob]);
}

export function useHydrateReceipt(
  id: string,
  receiptKey: string | null | undefined,
  blob: Blob | null | undefined,
): void {
  useEffect(() => {
    if (!blob && receiptKey) void hydrateSessionReceipt(id, receiptKey);
  }, [id, receiptKey, blob]);
}
