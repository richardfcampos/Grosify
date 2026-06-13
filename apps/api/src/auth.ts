import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db/index.js';
import * as schema from './db/schema.js';

const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [webOrigin],
  advanced: {
    // Cross-site (web e API em domínios diferentes) exige SameSite=None;Secure.
    // Em mesmo domínio (api.grosify.app + grosify.app) use Lax (mais seguro).
    crossSubDomainCookies: { enabled: process.env.CROSS_SITE_COOKIES === 'true' },
    defaultCookieAttributes: {
      sameSite: process.env.CROSS_SITE_COOKIES === 'true' ? 'none' : 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    },
  },
});

export type Auth = typeof auth;
