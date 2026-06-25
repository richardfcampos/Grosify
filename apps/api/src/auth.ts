import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db/index.js';
import * as schema from './db/schema.js';
import { trustedOrigins } from './origins.js';
import { renderResetEmail, renderVerificationEmail, resolveLocale, sendEmail } from './email/index.js';

const RESET_TTL_SEC = 60 * 60; // 1h
const VERIFY_TTL_SEC = 60 * 60 * 24; // 24h

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
    // SOFT: login é permitido sem verificar; verificação gateia ações de confiança
    // (criar/aceitar convite) — feito nas rotas, não aqui.
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: RESET_TTL_SEC,
    // Envio de email é fire-and-forget no Better Auth; falha é logada, nunca 500 ao usuário.
    // `forgetPassword` sempre responde genérico (anti-enumeration) independente de envio.
    sendResetPassword: async ({ user, url }, request) => {
      const { subject, html, text } = renderResetEmail(resolveLocale(request), {
        name: user.name,
        url,
      });
      await sendEmail({ to: user.email, subject, html, text });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: VERIFY_TTL_SEC,
    sendVerificationEmail: async ({ user, url }, request) => {
      const { subject, html, text } = renderVerificationEmail(resolveLocale(request), {
        name: user.name,
        url,
      });
      await sendEmail({ to: user.email, subject, html, text });
    },
  },
  trustedOrigins,
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
