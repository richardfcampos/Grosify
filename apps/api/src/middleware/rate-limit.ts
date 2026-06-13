import { createMiddleware } from 'hono/factory';

interface Bucket {
  timestamps: number[];
}

/**
 * Sliding window em memória — suficiente para instância única.
 * Trocar por store externo (Redis) só quando houver múltiplas instâncias.
 */
export function rateLimit(opts: { windowMs: number; max: number; keyFn?: (ip: string, path: string) => string }) {
  const buckets = new Map<string, Bucket>();

  return createMiddleware(async (c, next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown';
    const key = opts.keyFn ? opts.keyFn(ip, c.req.path) : `${ip}:${c.req.path}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      buckets.set(key, bucket);
    }
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < opts.windowMs);

    if (bucket.timestamps.length >= opts.max) {
      return c.json({ error: 'muitas requisições, tente de novo em instantes' }, 429);
    }
    bucket.timestamps.push(now);

    // Limpeza ocasional pra não vazar memória
    if (buckets.size > 10_000 && Math.random() < 0.01) {
      for (const [k, b] of buckets) {
        if (b.timestamps.every((t) => now - t >= opts.windowMs)) buckets.delete(k);
      }
    }

    await next();
  });
}
