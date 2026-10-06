import { setAccessToken, getAccessToken, clearAccessToken } from './access-token';

describe('access-token holder', () => {
  afterEach(() => {
    clearAccessToken();
  });

  it('should start empty so no Authorization header is sent pre-login', () => {
    expect(getAccessToken()).toBeNull();
  });

  it('should store the token in memory once set', () => {
    setAccessToken('header.payload.signature');

    expect(getAccessToken()).toBe('header.payload.signature');
  });

  it('should clear the token on logout so a revoked session cannot be reused', () => {
    setAccessToken('header.payload.signature');
    clearAccessToken();

    expect(getAccessToken()).toBeNull();
  });
});
