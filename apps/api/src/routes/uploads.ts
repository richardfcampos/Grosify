import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { presignGet, presignPut, r2Enabled } from '../lib/r2.js';
import { requireHousehold, type HouseholdEnv } from '../middleware/household.js';

/**
 * Upload/download de fotos via R2 presigned URLs.
 * A chave é SEMPRE derivada do household da sessão — o client nunca escolhe o path,
 * então um membro não consegue gravar/ler na casa de outro.
 */

const presignBody = z.object({
  kind: z.enum(['item', 'receipt']),
  id: z.string().min(1).max(100),
});

function keyFor(householdId: string, kind: 'item' | 'receipt', id: string): string {
  const folder = kind === 'item' ? 'items' : 'receipts';
  return `households/${householdId}/${folder}/${id}.webp`;
}

export const uploadsRoute = new Hono<HouseholdEnv>()
  .use('*', requireHousehold)
  // POST (mutação) → viewer é bloqueado pelo middleware: não sobe foto, só lê
  .post('/presign', zValidator('json', presignBody), async (c) => {
    if (!r2Enabled) return c.json({ error: 'storage_disabled' }, 501);
    const hid = c.get('householdId');
    const { kind, id } = c.req.valid('json');
    const key = keyFor(hid, kind, id);
    const url = await presignPut(key);
    return c.json({ key, url });
  })
  .get('/url', async (c) => {
    if (!r2Enabled) return c.json({ error: 'storage_disabled' }, 501);
    const hid = c.get('householdId');
    const key = c.req.query('key') ?? '';
    if (!key.startsWith(`households/${hid}/`)) return c.json({ error: 'forbidden' }, 403);
    const url = await presignGet(key);
    return c.json({ url });
  });
