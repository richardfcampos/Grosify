import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { auth } from './auth.js';
import { rateLimit } from './middleware/rate-limit.js';
import { catalogRoute } from './routes/catalog.js';
import { householdsRoute } from './routes/households.js';

const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

const app = new Hono()
  .use(logger())
  .use(
    '*',
    cors({
      origin: webOrigin,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }),
  )
  .get('/health', (c) => c.json({ ok: true }))
  .use('/api/auth/*', rateLimit({ windowMs: 60_000, max: 30 }))
  .on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  .route('/households', householdsRoute)
  .route('/catalog', catalogRoute);

export type AppType = typeof app;

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API ouvindo em http://localhost:${info.port}`);
});
