import { InMemoryTokenDenylist } from '../token.service';
import { deriveLoginKeys } from './login-keys';
import { LOGIN_SESSION_TTL_SECONDS, LoginSessionService } from './login-session.service';

function createService(secret = 'x'.repeat(32)): LoginSessionService {
  return new LoginSessionService(deriveLoginKeys(secret), new InMemoryTokenDenylist());
}

describe('LoginSessionService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should resolve the user when the session cookie it issued is presented', async () => {
    // Arrange
    const service = createService();
    const cookie = service.issue('user-1');

    // Act
    const session = await service.read(cookie);

    // Assert
    expect(session?.userId).toBe('user-1');
    expect(session?.sessionId).toEqual(expect.any(String));
  });

  it('should return null when the session has expired', async () => {
    const service = createService();
    const cookie = service.issue('user-1');
    const later = Date.now() + (LOGIN_SESSION_TTL_SECONDS + 1) * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(later);

    await expect(service.read(cookie)).resolves.toBeNull();
  });

  it('should return null when the session was signed by another deployment', async () => {
    const cookie = createService('a'.repeat(32)).issue('user-1');

    await expect(createService('b'.repeat(32)).read(cookie)).resolves.toBeNull();
  });

  it('should return null when the session was already used to issue a code', async () => {
    const service = createService();
    const cookie = service.issue('user-1');
    const session = await service.read(cookie);

    await service.end(session?.sessionId ?? '');

    await expect(service.read(cookie)).resolves.toBeNull();
  });

  it('should return null when no cookie is presented', async () => {
    await expect(createService().read(undefined)).resolves.toBeNull();
  });

  it('should accept the CSRF field that belongs to the CSRF cookie', () => {
    const service = createService();
    const { cookie, field } = service.issueCsrf();

    expect(service.verifyCsrf(cookie, field)).toBe(true);
  });

  it('should reject a CSRF field taken from another form', () => {
    const service = createService();
    const first = service.issueCsrf();
    const second = service.issueCsrf();

    expect(service.verifyCsrf(first.cookie, second.field)).toBe(false);
  });

  it('should reject the CSRF check when the cookie or the field is missing', () => {
    const service = createService();
    const { cookie, field } = service.issueCsrf();

    expect(service.verifyCsrf(undefined, field)).toBe(false);
    expect(service.verifyCsrf(cookie, undefined)).toBe(false);
    expect(service.verifyCsrf(cookie, '')).toBe(false);
  });
});
