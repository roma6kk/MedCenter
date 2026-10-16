import { assertLocalTarget, isLocalHost } from './local-target';

describe('isLocalHost', () => {
  it.each(['localhost', 'LOCALHOST', '127.0.0.1', '127.1.2.3', '[::1]', '::1', 'medcenter.localhost', 'fhir.test'])('should accept %s', (host) => {
    expect(isLocalHost(host)).toBe(true);
  });

  it.each(['example.com', 'medcenter.by', '10.0.0.5', '192.168.1.10', 'localhost.evil.com', 'notlocalhost', 'test'])('should refuse %s', (host) => {
    expect(isLocalHost(host)).toBe(false);
  });
});

describe('assertLocalTarget', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should accept a local URL without any opt-in', () => {
    expect(() => assertLocalTarget('SEED_AUTH_BASE_URL', 'http://localhost:8081', 'SEED_ALLOW_REMOTE', {})).not.toThrow();
  });

  it('should refuse a remote host and name the host and the opt-in variable but not the path', () => {
    const attempt = (): void => assertLocalTarget('SEED_AUTH_BASE_URL', 'https://stand.example.com/secret/path', 'SEED_ALLOW_REMOTE', {});

    expect(attempt).toThrow('SEED_AUTH_BASE_URL points at stand.example.com');
    expect(attempt).toThrow('SEED_ALLOW_REMOTE=true');
    expect(attempt).not.toThrow('secret');
  });

  it('should let a remote host through, with a warning, when the opt-in variable is true', () => {
    expect(() => assertLocalTarget('SMOKE_BASE_URL', 'https://stand.example.com', 'SMOKE_ALLOW_REMOTE', { SMOKE_ALLOW_REMOTE: 'true' })).not.toThrow();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('stand.example.com'));
  });

  it.each(['1', 'yes', 'false', ''])('should keep refusing a remote host when the opt-in variable is %p', (value) => {
    expect(() => assertLocalTarget('SMOKE_BASE_URL', 'https://stand.example.com', 'SMOKE_ALLOW_REMOTE', { SMOKE_ALLOW_REMOTE: value })).toThrow('not a local host');
  });

  it('should refuse a value that is not a URL without echoing it', () => {
    expect(() => assertLocalTarget('SMOKE_BASE_URL', 'not a url', 'SMOKE_ALLOW_REMOTE', {})).toThrow('SMOKE_BASE_URL is not a valid URL');
  });
});
