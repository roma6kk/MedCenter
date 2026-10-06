import { Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jose from 'jose';
import {
  captureAsyncHttpException,
  createMockHttpContext,
} from '../../__tests__/mock-context';
import { Public } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { revocationKeysOf, type TokenRevocationChecker } from './token-revocation';

// `jose` ships pure ESM and is imported lazily by the guard; mocking it keeps the
// suite offline while still exercising everything after signature verification.
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'jwks'),
  jwtVerify: jest.fn(),
}));

const verifyMock = jose.jwtVerify as unknown as jest.Mock;

class HealthController {
  @Public()
  health(): string {
    return 'ok';
  }
}

class MeController {
  me(): string {
    return 'me';
  }
}

const ACCESS_CLAIMS = {
  sub: 'user-1',
  scope: 'patient/*.read',
  role: 'PATIENT',
  jti: 'access-jti',
  sid: 'session-jti',
};

function createChecker(
  isRevoked: (key: string) => Promise<boolean>,
): jest.Mocked<TokenRevocationChecker> {
  return { isRevoked: jest.fn(isRevoked) };
}

function protectedContext(): ReturnType<typeof createMockHttpContext> {
  return createMockHttpContext({
    handler: MeController.prototype.me,
    controller: MeController,
    request: { headers: { authorization: 'Bearer signed.token.value' } },
  });
}

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(new Reflector());

  it('should reject with 401 UNAUTHENTICATED when no bearer token is presented to a protected route', async () => {
    const { context } = createMockHttpContext({
      handler: MeController.prototype.me,
      controller: MeController,
      request: { headers: {} },
    });

    const error = await captureAsyncHttpException(() => guard.canActivate(context));

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
  });

  it('should reject with 401 when the Authorization header is not a bearer scheme', async () => {
    const { context } = createMockHttpContext({
      handler: MeController.prototype.me,
      controller: MeController,
      request: { headers: { authorization: 'Basic dXNlcjpwYXNzd29yZA==' } },
    });

    const error = await captureAsyncHttpException(() => guard.canActivate(context));

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
  });

  it('should allow a @Public route to be reached without any token', async () => {
    const { context } = createMockHttpContext({
      handler: HealthController.prototype.health,
      controller: HealthController,
      request: { headers: {} },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('JwtAuthGuard revocation', () => {
  beforeEach(() => {
    process.env['JWT_JWKS_URI'] = 'https://api.medcenter.by/.well-known/jwks.json';
    process.env['JWT_ISSUER'] = 'https://api.medcenter.by';
    verifyMock.mockReset();
    verifyMock.mockResolvedValue({ payload: { ...ACCESS_CLAIMS } });
  });

  it('should reject with 401 TOKEN_REVOKED when the access token jti is revoked', async () => {
    const checker = createChecker(async (key) => key === 'access-jti');
    const guard = new JwtAuthGuard(new Reflector(), checker);
    const { context } = protectedContext();

    const error = await captureAsyncHttpException(() => guard.canActivate(context));

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ errorCode: 'TOKEN_REVOKED' });
  });

  it('should reject with 401 TOKEN_REVOKED when the session sid is revoked', async () => {
    const checker = createChecker(async (key) => key === 'session-jti');
    const guard = new JwtAuthGuard(new Reflector(), checker);
    const { context } = protectedContext();

    const error = await captureAsyncHttpException(() => guard.canActivate(context));

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ errorCode: 'TOKEN_REVOKED' });
  });

  it('should attach the verified claims when neither the jti nor the sid is revoked', async () => {
    const checker = createChecker(async () => false);
    const guard = new JwtAuthGuard(new Reflector(), checker);
    const { context, request } = protectedContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request['user']).toMatchObject({ sub: 'user-1', jti: 'access-jti', sid: 'session-jti' });
  });

  it('should not consult the denylist when the token carries no sid', async () => {
    verifyMock.mockResolvedValue({ payload: { ...ACCESS_CLAIMS, sid: undefined } });
    const checker = createChecker(async () => false);
    const guard = new JwtAuthGuard(new Reflector(), checker);

    await expect(guard.canActivate(protectedContext().context)).resolves.toBe(true);

    expect(checker.isRevoked).toHaveBeenCalledTimes(1);
    expect(checker.isRevoked).toHaveBeenCalledWith('access-jti');
  });

  it('should accept the token when no revocation checker is provided', async () => {
    const guard = new JwtAuthGuard(new Reflector());

    await expect(guard.canActivate(protectedContext().context)).resolves.toBe(true);
  });

  it('should fail open and log at error when the denylist is unreachable', async () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const checker = createChecker(async () => {
      throw new Error('ECONNREFUSED');
    });
    const guard = new JwtAuthGuard(new Reflector(), checker);

    try {
      await expect(guard.canActivate(protectedContext().context)).resolves.toBe(true);

      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'access-jti' }),
        'Revocation denylist unreachable; failing open',
      );
    } finally {
      logError.mockRestore();
    }
  });

  it('should reject with 401 UNAUTHENTICATED when the verified claims are incomplete', async () => {
    verifyMock.mockResolvedValue({ payload: { sub: 'user-1', role: 'PATIENT', jti: 'j' } });
    const guard = new JwtAuthGuard(new Reflector(), createChecker(async () => false));

    const error = await captureAsyncHttpException(() =>
      guard.canActivate(protectedContext().context),
    );

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
  });
});

describe('revocationKeysOf', () => {
  it('should return the jti and sid of a token pair', () => {
    expect(revocationKeysOf({ ...ACCESS_CLAIMS, jti: 'j', sid: 's' })).toEqual(['j', 's']);
  });

  it('should return only the jti when the token carries no sid', () => {
    expect(revocationKeysOf({ ...ACCESS_CLAIMS, jti: 'j', sid: undefined })).toEqual(['j']);
  });

  it('should de-duplicate when the jti and sid are the same', () => {
    expect(revocationKeysOf({ ...ACCESS_CLAIMS, jti: 'same', sid: 'same' })).toEqual(['same']);
  });
});
