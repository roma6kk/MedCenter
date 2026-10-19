import { parseLoginError } from './login-error';

describe('parseLoginError', () => {
  it('should be null when the visit is plain', () => {
    expect(parseLoginError(undefined)).toBeNull();
    expect(parseLoginError('')).toBeNull();
    expect(parseLoginError('  ')).toBeNull();
  });

  it('should read a refused sign-in when the code is access_denied', () => {
    expect(parseLoginError('access_denied')).toBe('denied');
  });

  it.each(['server_error', 'temporarily_unavailable'])('should read an unavailable service when the code is %s', (code) => {
    expect(parseLoginError(code)).toBe('unavailable');
  });

  it('should read a refused sign-in when the code is any other, instead of showing it', () => {
    expect(parseLoginError('<script>alert(1)</script>')).toBe('denied');
  });

  it('should look at the first value when the parameter is repeated', () => {
    expect(parseLoginError(['server_error', 'access_denied'])).toBe('unavailable');
  });

  it('should ignore the letter case when the code is written in capitals', () => {
    expect(parseLoginError('SERVER_ERROR')).toBe('unavailable');
  });
});
