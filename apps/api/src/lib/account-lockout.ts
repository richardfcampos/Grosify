import { and, eq, gte } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../db/index.js';
import { authAttempts } from '../db/schema.js';

const WINDOW_MS = 15 * 60 * 1000; // janela deslizante
const MAX_FAILS = 5; // falhas na janela → trava

export interface LockState {
  retryAfterSec: number;
}

/**
 * Trava por CONTA (não por IP): conta falhas de login na janela. Durável no Postgres,
 * então sobrevive a redeploy e a múltiplas instâncias — ataque que troca de IP não escapa.
 */
export async function checkLock(email: string): Promise<LockState | null> {
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await db
    .select({ createdAt: authAttempts.createdAt })
    .from(authAttempts)
    .where(
      and(
        eq(authAttempts.email, email),
        eq(authAttempts.kind, 'login_fail'),
        gte(authAttempts.createdAt, since),
      ),
    )
    .orderBy(authAttempts.createdAt);

  if (rows.length < MAX_FAILS) return null;
  const oldest = rows[0]!.createdAt.getTime();
  const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - Date.now()) / 1000));
  return { retryAfterSec };
}

export async function recordFailure(email: string): Promise<void> {
  await db.insert(authAttempts).values({ id: uuidv7(), email, kind: 'login_fail' });
}

export async function clearAttempts(email: string): Promise<void> {
  await db
    .delete(authAttempts)
    .where(and(eq(authAttempts.email, email), eq(authAttempts.kind, 'login_fail')));
}
