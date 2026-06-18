import { v7 as uuidv7 } from 'uuid';
import { db } from '../db/index.js';
import { activities } from '../db/schema.js';

/** Registra uma atividade no feed da casa (best-effort; não quebra a rota se falhar). */
export async function logActivity(
  householdId: string,
  actorId: string | null,
  actorName: string | null,
  action: string,
  summary: string | null = null,
): Promise<void> {
  try {
    await db.insert(activities).values({ id: uuidv7(), householdId, actorId, actorName, action, summary });
  } catch {
    // feed é secundário — ignora falhas
  }
}
