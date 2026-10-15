import { authorizeLocation, sanitizeAuthorizeQuery } from './authorize-query';

describe('sanitizeAuthorizeQuery', () => {
  it('should keep exactly the authorization request parameters when a parsed query is given', () => {
    // Arrange
    const query = {
      response_type: 'code',
      client_id: 'medcenter-web',
      redirect_uri: 'https://app.medcenter.by/api/auth/callback',
      scope: 'launch patient/*.read',
      state: 'abc.%2Fbooking',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
      injected: 'x',
    };

    // Act
    const sanitized = new URLSearchParams(sanitizeAuthorizeQuery(query));

    // Assert
    expect(sanitized.get('client_id')).toBe('medcenter-web');
    expect(sanitized.get('scope')).toBe('launch patient/*.read');
    expect(sanitized.get('state')).toBe('abc.%2Fbooking');
    expect(sanitized.has('injected')).toBe(false);
  });

  it('should take the first value of a repeated parameter when a raw query string is given', () => {
    const sanitized = new URLSearchParams(sanitizeAuthorizeQuery('client_id=a&client_id=b&response_type=code'));

    expect(sanitized.getAll('client_id')).toEqual(['a']);
  });

  it('should ignore non-string values when the parsed query carries arrays or objects', () => {
    const sanitized = new URLSearchParams(sanitizeAuthorizeQuery({ client_id: ['a', 'b'], state: { x: 1 } }));

    expect(sanitized.has('client_id')).toBe(false);
    expect(sanitized.has('state')).toBe(false);
  });

  it('should drop an oversized parameter value when it exceeds the limit', () => {
    const sanitized = new URLSearchParams(sanitizeAuthorizeQuery({ state: 'x'.repeat(5000), client_id: 'c' }));

    expect(sanitized.has('state')).toBe(false);
    expect(sanitized.get('client_id')).toBe('c');
  });
});

describe('authorizeLocation', () => {
  it('should always point at the authorize endpoint of this server when a query is given', () => {
    expect(authorizeLocation('client_id=c&response_type=code')).toBe(
      '/oauth/authorize?client_id=c&response_type=code',
    );
  });
});
