import { renderLoginPage } from '../../apps/auth-service/src/modules/oauth/login/login-page';
import { DEFAULT_LOGIN_ACTION, parseLoginForm, readFormAction, readInputValue, unescapeHtml } from './oauth-login-form';

const AUTHORIZE_QUERY =
  'response_type=code&client_id=medcenter-web&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback&scope=launch+user%2F*.read&state=a"b\'c<d>&code_challenge=xyz&code_challenge_method=S256';

describe('unescapeHtml', () => {
  it('should reverse the five entities the login page escapes', () => {
    expect(unescapeHtml('&amp;&lt;&gt;&quot;&#39;')).toBe('&<>"\'');
  });

  it('should not decode twice', () => {
    expect(unescapeHtml('&amp;lt;')).toBe('&lt;');
  });
});

describe('parseLoginForm', () => {
  it('should recover the CSRF field, the authorize query and the action from the real login page', () => {
    const html = renderLoginPage({ authorizeQuery: AUTHORIZE_QUERY, csrfField: 'mac-value_-x' });

    expect(parseLoginForm(html)).toEqual({ action: '/oauth/login', csrf: 'mac-value_-x', authorizeQuery: AUTHORIZE_QUERY });
  });

  it('should still find the form when the login page shows an error and a prefilled email', () => {
    const html = renderLoginPage({ authorizeQuery: AUTHORIZE_QUERY, csrfField: 'f', error: 'Неверный адрес', email: 'a"b@x.test' });

    expect(parseLoginForm(html).csrf).toBe('f');
  });

  it('should refuse a page without the hidden fields', () => {
    expect(() => parseLoginForm('<html><body><h1>502 Bad Gateway</h1></body></html>')).toThrow(/not the login form/);
  });

  it('should refuse a form whose csrf field is empty', () => {
    const html = renderLoginPage({ authorizeQuery: AUTHORIZE_QUERY, csrfField: '' });

    expect(() => parseLoginForm(html)).toThrow(/not the login form/);
  });
});

describe('readInputValue / readFormAction', () => {
  it('should find an input by name regardless of attribute order', () => {
    expect(readInputValue('<input value="v1" type="hidden" name="n">', 'n')).toBe('v1');
  });

  it('should not mistake a data-* attribute for the name', () => {
    expect(readInputValue('<input data-name="n" value="v1">', 'n')).toBeUndefined();
  });

  it('should fall back to the standard login path when the form has no action', () => {
    expect(readFormAction('<form method="post">')).toBe(DEFAULT_LOGIN_ACTION);
  });

  it('should read the action of the form', () => {
    expect(readFormAction('<form method="post" action="/oauth/login">')).toBe('/oauth/login');
  });
});
