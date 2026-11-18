import { createHash } from 'node:crypto';

import { LOGIN_FONT_BASE_PATH, LOGIN_FONT_FILES, LOGIN_PAGE_CSP, escapeHtml, renderLoginPage, renderLoginErrorPage } from './login-page';

const BASE = {
  authorizeQuery: 'client_id=medcenter-web&state=a%26b',
  csrfField: 'csrf-mac',
};

describe('renderLoginPage', () => {
  it('should render an accessible Russian form that posts to /oauth/login when no error is given', () => {
    const html = renderLoginPage(BASE);

    expect(html).toContain('<html lang="ru">');
    expect(html).toContain('<form method="post" action="/oauth/login"');
    expect(html).toContain('<label for="email">Электронная почта</label>');
    expect(html).toContain('<label for="password">Пароль</label>');
    expect(html).toContain('autocomplete="current-password"');
    expect(html).not.toContain('role="alert"');
  });

  it('should carry the CSRF token and the original authorize query as hidden fields when rendered', () => {
    const html = renderLoginPage(BASE);

    expect(html).toContain('name="csrf" value="csrf-mac"');
    expect(html).toContain('name="authorize_query" value="client_id=medcenter-web&amp;state=a%26b"');
  });

  it('should announce the error and keep the typed email when the credentials were rejected', () => {
    const html = renderLoginPage({ ...BASE, error: 'Неверный email или пароль', fieldError: true, email: 'ivanov@example.by' });

    expect(html).toContain('role="alert"');
    expect(html).toContain('Неверный email или пароль');
    expect(html).toContain('value="ivanov@example.by"');
    expect(html).toContain('aria-describedby="login-error"');
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(2);
  });

  it('should not mark the fields invalid when the refusal is not about them (limit, stale form, outage)', () => {
    const html = renderLoginPage({ ...BASE, error: 'Слишком много попыток входа', email: 'ivanov@example.by' });

    expect(html).toContain('role="alert"');
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).not.toContain('aria-describedby=');
  });

  it('should render the English page with lang en and the Lifeline name when the locale is en', () => {
    const html = renderLoginPage({ ...BASE, locale: 'en', registerUrl: 'https://app.medcenter.by/register', siteUrl: 'https://app.medcenter.by/' });

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<h1 id="page-title">Sign in to your account</h1>');
    expect(html).toContain('<label for="email">E-mail</label>');
    expect(html).toContain('<label for="password">Password</label>');
    expect(html).toContain('>Sign in</button>');
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain('No account yet?');
    expect(html).toContain('Back to the site');
    expect(html).toContain('<title>Sign in — Lifeline</title>');
    expect(html).not.toMatch(/Лайфлайн|Войти|Пароль/);
  });

  it('should escape markup when the email or the query carries HTML', () => {
    const html = renderLoginPage({ ...BASE, authorizeQuery: '"><script>x</script>', email: '<img src=x>' });

    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
  });

  it('should link to the client registration page when a register url is given', () => {
    const html = renderLoginPage({ ...BASE, registerUrl: 'https://app.medcenter.by/register' });

    expect(html).toContain('href="https://app.medcenter.by/register"');
  });
});

describe('renderLoginPage design', () => {
  it('should carry the brand mark and the clinic name when rendered', () => {
    const html = renderLoginPage(BASE);

    expect(html).toContain('class="mark"');
    expect(html).toContain('Лайфлайн');
  });

  it('should link back to the site when the site url is known and say nothing of it otherwise', () => {
    expect(renderLoginPage({ ...BASE, siteUrl: 'https://app.medcenter.by/' })).toContain('<a class="back" href="https://app.medcenter.by/">');
    expect(renderLoginPage(BASE)).not.toContain('class="back"');
  });

  it('should offer a named password visibility toggle that stays hidden until the script reveals it', () => {
    const html = renderLoginPage(BASE);

    expect(html).toMatch(/<button type="button" id="pw-toggle" class="toggle" hidden aria-pressed="false" aria-controls="password" aria-label="Показать пароль"/);
    expect(html).not.toContain('data-hide');
    expect(html).not.toContain('"aria-label"');
  });

  it('should keep the password field masked and its autocomplete hint when the toggle exists', () => {
    const html = renderLoginPage(BASE);

    expect(html).toContain('id="password" name="password" type="password" autocomplete="current-password"');
  });

  it('should use the Onest face from its own origin when the page is rendered', () => {
    const html = renderLoginPage(BASE);

    expect(html).toContain(`url(${LOGIN_FONT_BASE_PATH}/${LOGIN_FONT_FILES.cyrillic})`);
    expect(html).toContain('"Onest Variable"');
    expect(html).not.toMatch(/https?:\/\/[^"' ]*font/i);
  });

  it('should add no forgotten-password link while there is no reset flow', () => {
    expect(renderLoginPage(BASE)).not.toMatch(/забыли|forgot/i);
  });
});

describe('renderLoginErrorPage', () => {
  it('should render the message without a form when the request cannot be continued', () => {
    const html = renderLoginErrorPage('Запрос входа некорректен');

    expect(html).toContain('Запрос входа некорректен');
    expect(html).not.toContain('<form');
  });

  it('should render the English error page when the locale is en', () => {
    const html = renderLoginErrorPage('The sign-in request is invalid.', 'en');

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Could not continue signing in');
  });
});

describe('LOGIN_PAGE_CSP', () => {
  it('should pin the inline style and the inline script by the hash of what the page really carries when served', () => {
    const html = renderLoginPage(BASE);
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    const hash = (text: string): string => createHash('sha256').update(text).digest('base64');

    expect(LOGIN_PAGE_CSP).toContain(`style-src 'sha256-${hash(style)}'`);
    expect(LOGIN_PAGE_CSP).toContain(`script-src 'sha256-${hash(script)}'`);
  });

  it('should allow fonts from its own origin only and nothing foreign when served', () => {
    expect(LOGIN_PAGE_CSP).toContain("font-src 'self'");
    expect(LOGIN_PAGE_CSP).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
  });

  it('should forbid framing, foreign styles and un-hashed scripts when the page is served', () => {
    expect(LOGIN_PAGE_CSP).toContain("default-src 'none'");
    expect(LOGIN_PAGE_CSP).toContain("frame-ancestors 'none'");
    expect(LOGIN_PAGE_CSP).toMatch(/style-src 'sha256-[A-Za-z0-9+/=]+'/);
  });
});

describe('escapeHtml', () => {
  it('should escape the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});
