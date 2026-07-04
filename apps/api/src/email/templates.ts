import type { EmailMessage } from './types.js';
import { SUPPORTED_EMAIL_LOCALES, type EmailLocale } from './locales.js';

/**
 * Templates de email transacional, localizados nos 6 idiomas (E5).
 * A estrutura (HTML/wrapper) é compartilhada; só a CÓPIA muda por idioma — DRY.
 * Render puro (sem efeito colateral): facilita teste por idioma.
 */

interface Copy {
  subject: string;
  heading: string;
  hi: string; // saudação, recebe {name}
  intro: string;
  button: string;
  fallback: string;
  footer: string;
}

interface InviteCopy {
  subject: string; // recebe {household}
  heading: string;
  intro: string; // recebe {inviter} e {household}
  button: string;
  fallback: string;
  footer: string;
}

interface EmailCopy {
  verify: Copy;
  reset: Copy;
  invite: InviteCopy;
}

const COPY: Record<EmailLocale, EmailCopy> = {
  pt: {
    verify: {
      subject: 'Confirme seu e-mail no Grosify',
      heading: 'Confirme seu e-mail',
      hi: 'Olá {name},',
      intro: 'Bem-vindo ao Grosify! Confirme seu e-mail para proteger sua conta.',
      button: 'Confirmar e-mail',
      fallback: 'Se você não criou esta conta, ignore este e-mail.',
      footer: 'Grosify — sua lista, estoque e preços.',
    },
    reset: {
      subject: 'Redefinir sua senha do Grosify',
      heading: 'Redefinir senha',
      hi: 'Olá {name},',
      intro: 'Recebemos um pedido para redefinir sua senha. O link expira em 1 hora.',
      button: 'Redefinir senha',
      fallback: 'Se você não pediu isto, ignore este e-mail — sua senha continua a mesma.',
      footer: 'Grosify — sua lista, estoque e preços.',
    },
    invite: {
      subject: 'Convite para a casa "{household}" no Grosify',
      heading: 'Você foi convidado!',
      intro: '{inviter} convidou você para entrar na casa "{household}" no Grosify — listas, estoque e preços compartilhados.',
      button: 'Entrar na casa',
      fallback: 'Se você não esperava este convite, pode ignorar este e-mail.',
      footer: 'Grosify — sua lista, estoque e preços.',
    },
  },
  en: {
    verify: {
      subject: 'Confirm your email on Grosify',
      heading: 'Confirm your email',
      hi: 'Hi {name},',
      intro: 'Welcome to Grosify! Confirm your email to secure your account.',
      button: 'Confirm email',
      fallback: "If you didn't create this account, just ignore this email.",
      footer: 'Grosify — your list, stock and prices.',
    },
    reset: {
      subject: 'Reset your Grosify password',
      heading: 'Reset password',
      hi: 'Hi {name},',
      intro: 'We received a request to reset your password. This link expires in 1 hour.',
      button: 'Reset password',
      fallback: "If you didn't request this, ignore this email — your password stays the same.",
      footer: 'Grosify — your list, stock and prices.',
    },
    invite: {
      subject: 'Invitation to "{household}" on Grosify',
      heading: "You're invited!",
      intro: '{inviter} invited you to join the household "{household}" on Grosify — shared lists, stock and prices.',
      button: 'Join the household',
      fallback: "If you weren't expecting this invitation, you can ignore this email.",
      footer: 'Grosify — your list, stock and prices.',
    },
  },
  es: {
    verify: {
      subject: 'Confirma tu correo en Grosify',
      heading: 'Confirma tu correo',
      hi: 'Hola {name}:',
      intro: '¡Bienvenido a Grosify! Confirma tu correo para proteger tu cuenta.',
      button: 'Confirmar correo',
      fallback: 'Si no creaste esta cuenta, ignora este correo.',
      footer: 'Grosify — tu lista, inventario y precios.',
    },
    reset: {
      subject: 'Restablece tu contraseña de Grosify',
      heading: 'Restablecer contraseña',
      hi: 'Hola {name}:',
      intro: 'Recibimos una solicitud para restablecer tu contraseña. El enlace caduca en 1 hora.',
      button: 'Restablecer contraseña',
      fallback: 'Si no lo solicitaste, ignora este correo: tu contraseña sigue igual.',
      footer: 'Grosify — tu lista, inventario y precios.',
    },
    invite: {
      subject: 'Invitación a la casa "{household}" en Grosify',
      heading: '¡Te han invitado!',
      intro: '{inviter} te invitó a unirte a la casa "{household}" en Grosify: listas, inventario y precios compartidos.',
      button: 'Unirme a la casa',
      fallback: 'Si no esperabas esta invitación, puedes ignorar este correo.',
      footer: 'Grosify — tu lista, inventario y precios.',
    },
  },
  it: {
    verify: {
      subject: 'Conferma la tua email su Grosify',
      heading: 'Conferma la tua email',
      hi: 'Ciao {name},',
      intro: 'Benvenuto su Grosify! Conferma la tua email per proteggere il tuo account.',
      button: 'Conferma email',
      fallback: 'Se non hai creato questo account, ignora questa email.',
      footer: 'Grosify — la tua lista, scorte e prezzi.',
    },
    reset: {
      subject: 'Reimposta la password di Grosify',
      heading: 'Reimposta password',
      hi: 'Ciao {name},',
      intro: 'Abbiamo ricevuto una richiesta di reimpostazione password. Il link scade tra 1 ora.',
      button: 'Reimposta password',
      fallback: 'Se non hai richiesto questo, ignora questa email — la password resta la stessa.',
      footer: 'Grosify — la tua lista, scorte e prezzi.',
    },
    invite: {
      subject: 'Invito alla casa "{household}" su Grosify',
      heading: 'Sei stato invitato!',
      intro: '{inviter} ti ha invitato a unirti alla casa "{household}" su Grosify — liste, scorte e prezzi condivisi.',
      button: 'Unisciti alla casa',
      fallback: 'Se non ti aspettavi questo invito, puoi ignorare questa email.',
      footer: 'Grosify — la tua lista, scorte e prezzi.',
    },
  },
  de: {
    verify: {
      subject: 'Bestätige deine E-Mail bei Grosify',
      heading: 'E-Mail bestätigen',
      hi: 'Hallo {name},',
      intro: 'Willkommen bei Grosify! Bestätige deine E-Mail, um dein Konto zu schützen.',
      button: 'E-Mail bestätigen',
      fallback: 'Wenn du dieses Konto nicht erstellt hast, ignoriere diese E-Mail.',
      footer: 'Grosify — deine Liste, dein Vorrat und deine Preise.',
    },
    reset: {
      subject: 'Setze dein Grosify-Passwort zurück',
      heading: 'Passwort zurücksetzen',
      hi: 'Hallo {name},',
      intro: 'Wir haben eine Anfrage zum Zurücksetzen deines Passworts erhalten. Der Link läuft in 1 Stunde ab.',
      button: 'Passwort zurücksetzen',
      fallback: 'Wenn du das nicht angefordert hast, ignoriere diese E-Mail — dein Passwort bleibt unverändert.',
      footer: 'Grosify — deine Liste, dein Vorrat und deine Preise.',
    },
    invite: {
      subject: 'Einladung zum Haushalt "{household}" bei Grosify',
      heading: 'Du wurdest eingeladen!',
      intro: '{inviter} hat dich eingeladen, dem Haushalt "{household}" bei Grosify beizutreten — geteilte Listen, Vorräte und Preise.',
      button: 'Dem Haushalt beitreten',
      fallback: 'Wenn du diese Einladung nicht erwartet hast, kannst du diese E-Mail ignorieren.',
      footer: 'Grosify — deine Liste, dein Vorrat und deine Preise.',
    },
  },
  fr: {
    verify: {
      subject: 'Confirmez votre e-mail sur Grosify',
      heading: 'Confirmez votre e-mail',
      hi: 'Bonjour {name},',
      intro: 'Bienvenue sur Grosify ! Confirmez votre e-mail pour sécuriser votre compte.',
      button: "Confirmer l'e-mail",
      fallback: "Si vous n'avez pas créé ce compte, ignorez cet e-mail.",
      footer: 'Grosify — votre liste, votre stock et vos prix.',
    },
    reset: {
      subject: 'Réinitialisez votre mot de passe Grosify',
      heading: 'Réinitialiser le mot de passe',
      hi: 'Bonjour {name},',
      intro: 'Nous avons reçu une demande de réinitialisation de votre mot de passe. Le lien expire dans 1 heure.',
      button: 'Réinitialiser le mot de passe',
      fallback: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail — votre mot de passe reste inchangé.",
      footer: 'Grosify — votre liste, votre stock et vos prix.',
    },
    invite: {
      subject: 'Invitation au foyer "{household}" sur Grosify',
      heading: 'Vous êtes invité !',
      intro: '{inviter} vous a invité à rejoindre le foyer "{household}" sur Grosify — listes, stock et prix partagés.',
      button: 'Rejoindre le foyer',
      fallback: "Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet e-mail.",
      footer: 'Grosify — votre liste, votre stock et vos prix.',
    },
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type Rendered = Omit<EmailMessage, 'to'>;

interface RenderParts {
  subject: string;
  heading: string;
  /** parágrafos do corpo, já interpolados (escapados no HTML pelo build) */
  body: string[];
  button: string;
  url: string;
  fallback: string;
  footer: string;
}

/** Builder genérico: estrutura/HTML compartilhada entre verificação, reset e convite. */
function build({ subject, heading, body, button, url, fallback, footer }: RenderParts): Rendered {
  const bodyHtml = body
    .map((p) => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(p)}</p>`)
    .join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f6">
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
    <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin-bottom:20px">Grosify</div>
    <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>
    ${bodyHtml}
    <a href="${escapeHtml(url)}" style="display:inline-block;background:#15803D;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;margin-top:8px">${escapeHtml(button)}</a>
    <p style="color:#666;font-size:13px;margin:24px 0 4px;line-height:1.5">${escapeHtml(fallback)}</p>
    <p style="color:#999;font-size:12px;word-break:break-all;margin:0 0 24px">${escapeHtml(url)}</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:0 0 16px" />
    <p style="color:#999;font-size:12px;margin:0">${escapeHtml(footer)}</p>
  </div>
</body></html>`;

  const text = `${body.join('\n\n')}\n\n${button}: ${url}\n\n${fallback}\n\n${footer}`;
  return { subject, html, text };
}

function pick(locale: string): EmailLocale {
  return (SUPPORTED_EMAIL_LOCALES as readonly string[]).includes(locale)
    ? (locale as EmailLocale)
    : 'pt';
}

export function renderVerificationEmail(
  locale: string,
  { name, url }: { name: string; url: string },
): Rendered {
  const c = COPY[pick(locale)].verify;
  return build({
    subject: c.subject,
    heading: c.heading,
    body: [c.hi.replace('{name}', name), c.intro],
    button: c.button,
    url,
    fallback: c.fallback,
    footer: c.footer,
  });
}

export function renderResetEmail(
  locale: string,
  { name, url }: { name: string; url: string },
): Rendered {
  const c = COPY[pick(locale)].reset;
  return build({
    subject: c.subject,
    heading: c.heading,
    body: [c.hi.replace('{name}', name), c.intro],
    button: c.button,
    url,
    fallback: c.fallback,
    footer: c.footer,
  });
}

export function renderInviteEmail(
  locale: string,
  { inviterName, householdName, url }: { inviterName: string; householdName: string; url: string },
): Rendered {
  const c = COPY[pick(locale)].invite;
  const fill = (s: string) =>
    s.replace('{inviter}', inviterName).replace('{household}', householdName);
  return build({
    subject: fill(c.subject),
    heading: c.heading,
    body: [fill(c.intro)],
    button: c.button,
    url,
    fallback: c.fallback,
    footer: c.footer,
  });
}
