import { parseTokenSet } from './token-response';

const VALID = { access_token: 'a.b.c', refresh_token: 'r1', expires_in: 900, token_type: 'Bearer' };

describe('parseTokenSet', () => {
  it('should map a valid token endpoint body', () => {
    expect(parseTokenSet(VALID)).toEqual({ accessToken: 'a.b.c', refreshToken: 'r1', expiresIn: 900 });
  });

  it.each([
    ['null', null],
    ['a string', 'token'],
    ['no access token', { ...VALID, access_token: undefined }],
    ['an empty access token', { ...VALID, access_token: '' }],
    ['no refresh token', { ...VALID, refresh_token: undefined }],
    ['a non-string refresh token', { ...VALID, refresh_token: 7 }],
    ['a missing lifetime', { ...VALID, expires_in: undefined }],
    ['a zero lifetime', { ...VALID, expires_in: 0 }],
    ['a string lifetime', { ...VALID, expires_in: '900' }],
  ])('should reject %s so no half-formed token reaches a cookie', (_label, body) => {
    expect(parseTokenSet(body)).toBeNull();
  });
});
