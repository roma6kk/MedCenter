import { LOGIN_PAGE_CSP, escapeHtml, renderLoginPage, renderLoginErrorPage } from './login-page';

const BASE = {
  authorizeQuery: 'client_id=medcenter-web&state=a%26b',
  csrfField: 'csrf-mac',
};

describe('renderLoginPage', () => {
  it('should render an accessible Russian form that posts to /oauth/login when no error is given', () => {
    // Act
    const html = renderLoginPage(BASE);

    // Assert
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
    const html = renderLoginPage({ ...BASE, error: 'Неверный email или пароль', email: 'ivanov@example.by' });

    expect(html).toContain('role="alert"');
    expect(html).toContain('Неверный email или пароль');
    expect(html).toContain('value="ivanov@example.by"');
    expect(html).toContain('aria-describedby="login-error"');
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

describe('renderLoginErrorPage', () => {
  it('should render the message without a form when the request cannot be continued', () => {
    const html = renderLoginErrorPage('Запрос входа некорректен');

    expect(html).toContain('Запрос входа некорректен');
    expect(html).not.toContain('<form');
  });
});

describe('LOGIN_PAGE_CSP', () => {
  it('should forbid scripts, framing and foreign styles when the page is served', () => {
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
