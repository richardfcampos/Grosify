import { db } from '../db/dexie.js';

/**
 * Fotos via R2 (presigned URLs do servidor). Tudo tolera R2 desligado:
 * se o servidor responde 501 (sem credencial), marca `storageOff` e o app
 * segue com o blob local no Dexie — comportamento atual, sem quebrar nada.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3010';

let storageOff = false;
/** R2 está desligado no servidor (501 visto). Sweep pula rápido. */
export function storageDisabled(): boolean {
  return storageOff;
}

/** Sobe o blob pro R2. Retorna a key, ou null (R2 off / offline / falha). */
export async function uploadBlob(
  kind: 'item' | 'receipt',
  id: string,
  blob: Blob,
): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/uploads/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id }),
      credentials: 'include',
    });
  } catch {
    return null;
  }
  if (res.status === 501) {
    storageOff = true;
    return null;
  }
  if (!res.ok) return null;
  const { key, url } = (await res.json()) as { key: string; url: string };
  try {
    const put = await fetch(url, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': blob.type || 'image/webp' },
    });
    if (!put.ok) return null;
  } catch {
    return null;
  }
  return key;
}

/** Baixa o blob do R2 por key. Retorna null se R2 off / offline / falha. */
export async function downloadBlob(key: string): Promise<Blob | null> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/uploads/url?key=${encodeURIComponent(key)}`, {
      credentials: 'include',
    });
  } catch {
    return null;
  }
  if (res.status === 501) {
    storageOff = true;
    return null;
  }
  if (!res.ok) return null;
  const { url } = (await res.json()) as { url: string };
  try {
    const got = await fetch(url);
    if (!got.ok) return null;
    return await got.blob();
  } catch {
    return null;
  }
}

// evita baixar a mesma foto em paralelo (vários renders)
const hydrating = new Set<string>();

/** Baixa a foto remota pro cache local (Dexie) — liveQuery re-renderiza com o blob. */
export async function hydrateItemPhoto(id: string, key: string): Promise<void> {
  const tag = `i:${id}`;
  if (hydrating.has(tag) || storageOff) return;
  hydrating.add(tag);
  try {
    const blob = await downloadBlob(key);
    if (blob) await db.items.update(id, { photoBlob: blob });
  } finally {
    hydrating.delete(tag);
  }
}

/** Baixa o recibo remoto pro cache local (Dexie). */
export async function hydrateSessionReceipt(id: string, key: string): Promise<void> {
  const tag = `s:${id}`;
  if (hydrating.has(tag) || storageOff) return;
  hydrating.add(tag);
  try {
    const blob = await downloadBlob(key);
    if (blob) await db.sessions.update(id, { receiptBlob: blob });
  } finally {
    hydrating.delete(tag);
  }
}
