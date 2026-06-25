import { describe, expect, it } from 'vitest';
import { SUPPORTED_EMAIL_LOCALES } from './locales.js';
import { renderResetEmail, renderVerificationEmail } from './templates.js';

const URL = 'https://api.grosify.app/verify-email?token=abc123';

describe('email templates — 6 idiomas', () => {
  for (const loc of SUPPORTED_EMAIL_LOCALES) {
    it(`verificação [${loc}] tem subject, url e botão`, () => {
      const m = renderVerificationEmail(loc, { name: 'Ana', url: URL });
      expect(m.subject.length).toBeGreaterThan(0);
      expect(m.html).toContain(URL);
      expect(m.text).toContain(URL);
      expect(m.html).toContain('Ana');
    });

    it(`reset [${loc}] tem subject, url e botão`, () => {
      const m = renderResetEmail(loc, { name: 'Ana', url: URL });
      expect(m.subject.length).toBeGreaterThan(0);
      expect(m.html).toContain(URL);
      expect(m.text).toContain(URL);
    });
  }

  it('escapa HTML no nome (anti-injeção no email)', () => {
    const m = renderVerificationEmail('pt', { name: '<script>x</script>', url: URL });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });

  it('idioma desconhecido → fallback pt', () => {
    const unknown = renderResetEmail('ja', { name: 'Ana', url: URL });
    const pt = renderResetEmail('pt', { name: 'Ana', url: URL });
    expect(unknown.subject).toBe(pt.subject);
  });
});
