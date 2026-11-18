import { OAuthFlowError } from '../demo-seed/oauth-flow-error';
import { RESEED_USERS_HINT, decodeClaims, withLoginHint } from './smoke-session';

function jwtWith(payload: object): string {
  const part = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(payload)}.signature`;
}

describe('decodeClaims', () => {
  it('should read the role, scope and identity claims of the payload', () => {
    const claims = decodeClaims(jwtWith({ sub: 'u-1', role: 'PATIENT', scope: 'launch patient/*.read', patient: '1439', fhirUser: 'Patient/1439' }));

    expect(claims).toMatchObject({ sub: 'u-1', role: 'PATIENT', patient: '1439', fhirUser: 'Patient/1439' });
  });

  it('should refuse a token that is not three dot-separated parts', () => {
    expect(() => decodeClaims('opaque')).toThrow('not a JWT');
  });

  it('should refuse a payload that is not a JSON object', () => {
    expect(() => decodeClaims(jwtWith([1, 2]))).not.toThrow();
    expect(() => decodeClaims(`a.${Buffer.from('null').toString('base64url')}.c`)).toThrow('not a JSON object');
  });
});

describe('withLoginHint', () => {
  it('should name the users seed step when the login form rejected the manifest credentials', () => {
    const error = withLoginHint(new OAuthFlowError('login', 'credentials rejected (wrong email or password, or the account is inactive)'));

    expect((error as Error).message).toContain('credentials rejected');
    expect((error as Error).message).toContain('npm run seed:demo -- --users --with-admin --consents');
  });

  it('should add the hint only once', () => {
    const error = withLoginHint(withLoginHint(new OAuthFlowError('login', 'credentials rejected')));

    expect((error as Error).message.split(RESEED_USERS_HINT)).toHaveLength(2);
  });

  it('should leave other failures as they are', () => {
    const error = new OAuthFlowError('login', 'rate limit reached (10 login attempts per minute per address)');

    expect((withLoginHint(error) as Error).message).toBe('OAuth login step failed: rate limit reached (10 login attempts per minute per address)');
    expect(withLoginHint('not an error')).toBe('not an error');
  });
});
