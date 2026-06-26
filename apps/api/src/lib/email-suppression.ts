import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { emailSuppression } from '../db/schema.js';

/** true se o e-mail foi suprimido (bounce/reclamação) — não enviar mais. */
export async function isSuppressed(email: string): Promise<boolean> {
  const rows = await db
    .select({ email: emailSuppression.email })
    .from(emailSuppression)
    .where(eq(emailSuppression.email, email.toLowerCase()))
    .limit(1);
  return rows.length > 0;
}

/** Marca um e-mail como suprimido. Idempotente. */
export async function suppress(email: string, reason: string): Promise<void> {
  await db
    .insert(emailSuppression)
    .values({ email: email.toLowerCase(), reason })
    .onConflictDoNothing();
}
