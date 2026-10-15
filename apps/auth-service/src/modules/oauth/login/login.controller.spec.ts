import type { CredentialsService } from '../../users/credentials.service';
import { InMemoryClientRegistry } from '../guards/client.guard';
import { createFakeResponse } from '../__tests__/fake-response';
import { createLoginHarness, type LoginHarness } from '../__tests__/login-harness';
import { TEST_REDIRECT_URI, createTestClient } from '../__tests__/test-keys';
import { InMemoryLoginAttemptStore, type LoginAttemptStore } from './login-attempt-store';
import { LOGIN_CSRF_COOKIE, LOGIN_SESSION_COOKIE } from './login-cookies';
import type { LoginFormDto } from './login-form.dto';
import { ACCOUNT_ATTEMPT_LIMIT, ACCOUNT_ATTEMPT_WINDOW_SECONDS, LoginThrottle } from './login-throttle.service';
import {
  BROKEN_REQUEST_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  LoginController,
  STALE_FORM_MESSAGE,
  THROTTLED_MESSAGE,
  UNAVAILABLE_MESSAGE,
} from './login.controller';

const AUTHORIZE_QUERY = new URLSearchParams({
  response_type: 'code',
  client_id: 'medcenter-web',
  redirect_uri: TEST_REDIRECT_URI,
  state: 'st',
  code_challenge: 'challenge',
  code_challenge_method: 'S256',
}).toString();

interface Setup extends LoginHarness {
  readonly controller: LoginController;
  readonly verify: jest.Mock;
}

function setup(userId: string | null = 'user-1', attempts: LoginAttemptStore = new InMemoryLoginAttemptStore()): Setup {
  const harness = createLoginHarness();
  const verify = jest.fn().mockResolvedValue(userId);
  const credentials = { verify } as unknown as CredentialsService;
  const clients = new InMemoryClientRegistry([createTestClient()]);
  const controller = new LoginController(credentials, new LoginThrottle(attempts), harness.sessions, harness.page, clients);
  return { ...harness, controller, verify };
}

function submit(setupResult: Setup, form: Partial<LoginFormDto> = {}): { form: LoginFormDto; cookie: string } {
  const csrf = setupResult.sessions.issueCsrf();
  return {
    form: { email: 'ivanov@example.by', password: 'Str0ng!Pass1', csrf: csrf.field, authorize_query: AUTHORIZE_QUERY, ...form },
    cookie: `${LOGIN_CSRF_COOKIE}=${csrf.cookie}`,
  };
}

describe('LoginController', () => {
  it('should set the login session and return to the authorize endpoint when the credentials are valid', async () => {
    // Arrange
    const context = setup();
    const { form, cookie } = submit(context);
    const fake = createFakeResponse();

    // Act
    await context.controller.login(form, { headers: { cookie } }, fake.response);

    // Assert
    expect(fake.redirect).toHaveBeenCalledWith(302, `/oauth/authorize?${AUTHORIZE_QUERY}`);
    const session = fake.cookies.find((set) => set.name === LOGIN_SESSION_COOKIE);
    expect(session?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/oauth' });
    await expect(context.sessions.read(session?.value)).resolves.toMatchObject({ userId: 'user-1' });
    expect(fake.cleared).toContain(LOGIN_CSRF_COOKIE);
  });

  it('should re-render the form with one generic message when the credentials are rejected', async () => {
    const context = setup(null);
    const { form, cookie } = submit(context);
    const fake = createFakeResponse();

    await context.controller.login(form, { headers: { cookie } }, fake.response);

    expect(fake.redirect).not.toHaveBeenCalled();
    expect(fake.body()).toContain(INVALID_CREDENTIALS_MESSAGE);
    expect(fake.body()).toContain('value="ivanov@example.by"');
    expect(fake.cookies.some((set) => set.name === LOGIN_SESSION_COOKIE)).toBe(false);
  });

  it('should refuse with 403 and never check the password when the CSRF token does not match', async () => {
    const context = setup();
    const { form } = submit(context);
    const fake = createFakeResponse();

    await context.controller.login(form, { headers: { cookie: `${LOGIN_CSRF_COOKIE}=other-nonce` } }, fake.response);

    expect(fake.statusCode()).toBe(403);
    expect(fake.body()).toContain(STALE_FORM_MESSAGE);
    expect(context.verify).not.toHaveBeenCalled();
  });

  it('should answer 400 without a form when the authorization request names no registered client', async () => {
    const context = setup();
    const { form, cookie } = submit(context, { authorize_query: 'client_id=unknown&response_type=code' });
    const fake = createFakeResponse();

    await context.controller.login(form, { headers: { cookie } }, fake.response);

    expect(fake.statusCode()).toBe(400);
    expect(fake.body()).toContain(BROKEN_REQUEST_MESSAGE);
    expect(fake.body()).not.toContain('<form');
  });

  it('should answer 400 when the redirect_uri of the form is not registered for the client', async () => {
    const context = setup();
    const query = AUTHORIZE_QUERY.replace(encodeURIComponent(TEST_REDIRECT_URI), encodeURIComponent('https://evil.example/cb'));
    const { form, cookie } = submit(context, { authorize_query: query });
    const fake = createFakeResponse();

    await context.controller.login(form, { headers: { cookie } }, fake.response);

    expect(fake.statusCode()).toBe(400);
    expect(fake.redirect).not.toHaveBeenCalled();
  });

  it('should drop smuggled parameters from the redirect when the form query carries extras', async () => {
    const context = setup();
    const { form, cookie } = submit(context, { authorize_query: `${AUTHORIZE_QUERY}&prompt=none&next=https://evil.example` });
    const fake = createFakeResponse();

    await context.controller.login(form, { headers: { cookie } }, fake.response);

    expect(fake.redirect).toHaveBeenCalledWith(302, `/oauth/authorize?${AUTHORIZE_QUERY}`);
  });

  describe('per-account throttle', () => {
    async function attempt(context: Setup, form: Partial<LoginFormDto> = {}): Promise<ReturnType<typeof createFakeResponse>> {
      const { form: body, cookie } = submit(context, form);
      const fake = createFakeResponse();
      await context.controller.login(body, { headers: { cookie } }, fake.response);
      return fake;
    }

    it('should refuse with 429 and never check the password when the account exhausted its attempts', async () => {
      const context = setup(null);
      for (let spent = 0; spent < ACCOUNT_ATTEMPT_LIMIT; spent += 1) {
        await attempt(context);
      }

      const fake = await attempt(context);

      expect(fake.statusCode()).toBe(429);
      expect(fake.body()).toContain(THROTTLED_MESSAGE);
      expect(fake.headers['Retry-After']).toBe(String(ACCOUNT_ATTEMPT_WINDOW_SECONDS));
      expect(context.verify).toHaveBeenCalledTimes(ACCOUNT_ATTEMPT_LIMIT);
    });

    it('should refuse even the right password when the account is over its limit', async () => {
      const attempts = new InMemoryLoginAttemptStore();
      const guessing = setup(null, attempts);
      for (let spent = 0; spent <= ACCOUNT_ATTEMPT_LIMIT; spent += 1) {
        await attempt(guessing);
      }
      const owner = setup('user-1', attempts);

      const fake = await attempt(owner);

      expect(fake.redirect).not.toHaveBeenCalled();
      expect(fake.statusCode()).toBe(429);
      expect(owner.verify).not.toHaveBeenCalled();
    });

    it('should give the whole budget back when a valid login clears the counter', async () => {
      const attempts = new InMemoryLoginAttemptStore();
      const failing = setup(null, attempts);
      for (let spent = 0; spent < ACCOUNT_ATTEMPT_LIMIT - 1; spent += 1) {
        await attempt(failing);
      }
      await attempt(setup('user-1', attempts));

      const fake = await attempt(failing);

      expect(fake.statusCode()).toBe(200);
      expect(fake.body()).toContain(INVALID_CREDENTIALS_MESSAGE);
    });

    it('should refuse with 503 and never check the password when the attempt counter is unreachable', async () => {
      const broken: LoginAttemptStore = {
        record: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const context = setup('user-1', broken);

      const fake = await attempt(context);

      expect(fake.statusCode()).toBe(503);
      expect(fake.body()).toContain(UNAVAILABLE_MESSAGE);
      expect(context.verify).not.toHaveBeenCalled();
    });

    it('should not spend the account budget when the CSRF token is wrong', async () => {
      const attempts = new InMemoryLoginAttemptStore();
      const record = jest.spyOn(attempts, 'record');
      const context = setup('user-1', attempts);
      const { form } = submit(context);

      await context.controller.login(form, { headers: { cookie: `${LOGIN_CSRF_COOKIE}=other-nonce` } }, createFakeResponse().response);

      expect(record).not.toHaveBeenCalled();
    });
  });
});
