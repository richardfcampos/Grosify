import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { auth } from './auth.js';
import { authGuardReset, authGuardSignin, authGuardSignup } from './auth-guards.js';
import { rateLimit } from './middleware/rate-limit.js';
import { catalogRoute } from './routes/catalog.js';
import { webhooksRoute } from './routes/webhooks.js';
import { householdsRoute } from './routes/households.js';
import { meRoute } from './routes/me.js';
import { shoppingRoute } from './routes/shopping.js';
import { syncRoute } from './routes/sync.js';
import { uploadsRoute } from './routes/uploads.js';
import { isAllowedOrigin } from './origins.js';

const app = new Hono()
  .use(logger())
  .use(
    '*',
    cors({
      origin: (origin) => (isAllowedOrigin(origin) ? origin : null),
      credentials: true,
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }),
  )
  .get('/health', (c) => c.json({ ok: true }))
  .use('/api/auth/*', rateLimit({ windowMs: 60_000, max: 30 }))
  // Guards anti-abuso na frente do Better Auth (registrados antes do catch-all — Hono
  // casa a rota estática mais específica e o handler retorna Response, encerrando a cadeia).
  .post('/api/auth/sign-up/email', authGuardSignup)
  .post('/api/auth/sign-in/email', authGuardSignin)
  .post('/api/auth/reset-password', authGuardReset)
  .on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  .route('/webhooks', webhooksRoute)
  .route('/households', householdsRoute)
  .route('/catalog', catalogRoute)
  .route('/shopping', shoppingRoute)
  .route('/sync', syncRoute)
  .route('/me', meRoute)
  .route('/uploads', uploadsRoute);

export type AppType = typeof app;

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API ouvindo em http://localhost:${info.port}`);
});
