import { OAuthCookieJar } from './oauth-cookie-jar';

function responseWith(...cookies: string[]): Response {
  const headers = new Headers();
  cookies.forEach((cookie) => headers.append('set-cookie', cookie));
  return new Response(null, { headers });
}

describe('OAuthCookieJar', () => {
  it('should send every stored cookie in one Cookie header', () => {
    const jar = new OAuthCookieJar();

    jar.store(responseWith('mc_as_csrf=nonce; Path=/oauth; HttpOnly', 'other=1; Path=/'));

    expect(jar.header()).toBe('mc_as_csrf=nonce; other=1');
  });

  it('should send an empty header when nothing is stored', () => {
    expect(new OAuthCookieJar().header()).toBe('');
  });

  it('should replace a cookie that is set again', () => {
    const jar = new OAuthCookieJar();
    jar.store(responseWith('a=1'));

    jar.store(responseWith('a=2'));

    expect(jar.header()).toBe('a=2');
  });

  it('should drop a cookie the server expires, as it does with the CSRF cookie after login', () => {
    const jar = new OAuthCookieJar();
    jar.store(responseWith('mc_as_csrf=nonce'));

    jar.store(responseWith('mc_as_csrf=; Path=/oauth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly', 'mc_as_session=abc; Max-Age=300'));

    expect(jar.has('mc_as_csrf')).toBe(false);
    expect(jar.header()).toBe('mc_as_session=abc');
  });

  it('should drop a cookie whose Max-Age is zero', () => {
    const jar = new OAuthCookieJar();
    jar.store(responseWith('a=1'));

    jar.store(responseWith('a=1; Max-Age=0'));

    expect(jar.has('a')).toBe(false);
  });

  it('should keep a value that contains an equals sign', () => {
    const jar = new OAuthCookieJar();

    jar.store(responseWith('token=abc==; Path=/'));

    expect(jar.header()).toBe('token=abc==');
  });

  it('should ignore a malformed Set-Cookie header', () => {
    const jar = new OAuthCookieJar();

    jar.store(responseWith('no-separator', '=novalue'));

    expect(jar.header()).toBe('');
  });
});
