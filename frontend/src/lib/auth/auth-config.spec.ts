import {
  DEFAULT_AUTH_BACKEND_URL,
  DEFAULT_PUBLIC_ORIGIN,
  isSecureOrigin,
  publicUrl,
  resolveAuthBackendUrl,
  resolveOauthClientId,
  resolvePublicOrigin,
  resolveRedirectUri,
} from './auth-config';

describe('resolvePublicOrigin', () => {
  it('should default to the origin registered for the dev stack when nothing is configured', () => {
    expect(resolvePublicOrigin({})).toBe(DEFAULT_PUBLIC_ORIGIN);
  });

  it('should prefer APP_PUBLIC_URL over NEXT_PUBLIC_APP_URL', () => {
    const env = { APP_PUBLIC_URL: 'https://med.example.by', NEXT_PUBLIC_APP_URL: 'https://other.example.by' };

    expect(resolvePublicOrigin(env)).toBe('https://med.example.by');
  });

  it('should fall back to NEXT_PUBLIC_APP_URL when APP_PUBLIC_URL is empty', () => {
    expect(resolvePublicOrigin({ APP_PUBLIC_URL: '  ', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100' })).toBe('http://127.0.0.1:3100');
  });

  it('should strip a path and a trailing slash down to the bare origin', () => {
    expect(resolvePublicOrigin({ APP_PUBLIC_URL: 'https://med.example.by/some/path/' })).toBe('https://med.example.by');
  });

  it.each([['not a url'], ['ftp://med.example.by'], ['javascript:alert(1)'], ['//med.example.by']])(
    'should reject %s when it is configured as the public URL',
    (value) => {
      expect(() => resolvePublicOrigin({ APP_PUBLIC_URL: value })).toThrow(/APP_PUBLIC_URL/);
    },
  );
});

describe('publicUrl and resolveRedirectUri', () => {
  it('should build the registered callback redirect_uri on the public origin', () => {
    expect(resolveRedirectUri({})).toBe('http://localhost:3000/api/auth/callback');
    expect(resolveRedirectUri({ APP_PUBLIC_URL: 'https://med.example.by' })).toBe('https://med.example.by/api/auth/callback');
  });

  it('should resolve an app path with its query on the public origin', () => {
    expect(publicUrl('/login?error=access_denied', {}).toString()).toBe('http://localhost:3000/login?error=access_denied');
  });

  it.each([['login'], ['//evil.example.com'], ['https://evil.example.com']])('should refuse the non-path %s', (path) => {
    expect(() => publicUrl(path, {})).toThrow(/absolute path/);
  });
});

describe('resolveAuthBackendUrl and resolveOauthClientId', () => {
  it('should default to the host both the browser and the web container resolve', () => {
    expect(resolveAuthBackendUrl({})).toBe(DEFAULT_AUTH_BACKEND_URL);
  });

  it('should drop trailing slashes of the configured backend URL', () => {
    expect(resolveAuthBackendUrl({ AUTH_BACKEND_URL: 'http://auth:3000//' })).toBe('http://auth:3000');
  });

  it('should default the client id to medcenter-web', () => {
    expect(resolveOauthClientId({})).toBe('medcenter-web');
    expect(resolveOauthClientId({ OAUTH_CLIENT_ID: 'custom' })).toBe('custom');
  });
});

describe('isSecureOrigin', () => {
  it('should mark https origins as secure and plain http as not', () => {
    expect(isSecureOrigin('https://med.example.by')).toBe(true);
    expect(isSecureOrigin('http://localhost:3000')).toBe(false);
  });
});
