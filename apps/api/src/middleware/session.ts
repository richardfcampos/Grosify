import { createMiddleware } from 'hono/factory';
import { auth } from '../auth.js';

type SessionData = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export interface AuthEnv {
  Variables: {
    user: SessionData['user'];
    session: SessionData['session'];
  };
}

export const requireSession = createMiddleware<AuthEnv>(async (c, next) => {
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!sessionData) {
    return c.json({ error: 'not_authenticated' }, 401);
  }
  c.set('user', sessionData.user);
  c.set('session', sessionData.session);
  await next();
});
