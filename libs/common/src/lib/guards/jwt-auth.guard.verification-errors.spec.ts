import { Reflector } from '@nestjs/core';
import * as jose from 'jose';

import { captureAsyncHttpException, createMockHttpContext } from '../../__tests__/mock-context';
import { JwtAuthGuard } from './jwt-auth.guard';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'jwks'),
  jwtVerify: jest.fn(),
}));

const verifyMock = jose.jwtVerify as unknown as jest.Mock;

class MeController {
  me(): string {
    return 'me';
  }
}

function joseError(name: string, code: string): Error {
  return Object.assign(new Error(`${name}: ${code}`), { name, code });
}

function protectedContext(): ReturnType<typeof createMockHttpContext> {
  return createMockHttpContext({
    handler: MeController.prototype.me,
    controller: MeController,
    request: { headers: { authorization: 'Bearer forged.or.expired' } },
  });
}

describe('JwtAuthGuard signature and claim verification errors', () => {
  const guard = new JwtAuthGuard(new Reflector());

  beforeEach(() => {
    process.env['JWT_JWKS_URI'] = 'https://api.medcenter.by/.well-known/jwks.json';
    process.env['JWT_ISSUER'] = 'https://api.medcenter.by';
    verifyMock.mockReset();
  });

  it.each([
    ['an expired token', joseError('JWTExpired', 'ERR_JWT_EXPIRED')],
    ['a forged signature', joseError('JWSSignatureVerificationFailed', 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED')],
    ['a key id the issuer does not publish', joseError('JWKSNoMatchingKey', 'ERR_JWKS_NO_MATCHING_KEY')],
    ['a token of another issuer', joseError('JWTClaimValidationFailed', 'ERR_JWT_CLAIM_VALIDATION_FAILED')],
    ['a malformed token', joseError('JWSInvalid', 'ERR_JWS_INVALID')],
    ['a token that is not a JWT', joseError('JWTInvalid', 'ERR_JWT_INVALID')],
    ['an algorithm the issuer does not use (alg=none)', joseError('JOSENotSupported', 'ERR_JOSE_NOT_SUPPORTED')],
    ['an algorithm outside the allow-list', joseError('JOSEAlgNotAllowed', 'ERR_JOSE_ALG_NOT_ALLOWED')],
  ])('should reject with 401 UNAUTHENTICATED when jose reports %s', async (_label, failure) => {
    verifyMock.mockRejectedValue(failure);
    const { context } = protectedContext();

    const error = await captureAsyncHttpException(() => guard.canActivate(context));

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
  });

  it('should let an unreachable JWKS endpoint surface as a server error and never as an accepted token', async () => {
    verifyMock.mockRejectedValue(joseError('JWKSTimeout', 'ERR_JWKS_TIMEOUT'));
    const { context } = protectedContext();

    const outcome = guard.canActivate(context);

    await expect(outcome).rejects.toMatchObject({ code: 'ERR_JWKS_TIMEOUT' });
  });

  it('should leave the reason of the rejection out of the 401 body when the signature is forged', async () => {
    verifyMock.mockRejectedValue(joseError('JWSSignatureVerificationFailed', 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'));
    const { context } = protectedContext();

    const error = await captureAsyncHttpException(() => guard.canActivate(context));

    expect(JSON.stringify(error.getResponse())).not.toMatch(/signature/i);
  });

  it('should let the error surface as a server error when it is not a jose rejection', async () => {
    verifyMock.mockRejectedValue(new TypeError('fetch failed'));
    const { context } = protectedContext();

    await expect(guard.canActivate(context)).rejects.toThrow('fetch failed');
  });

  it('should attach no claims to the request when verification fails', async () => {
    verifyMock.mockRejectedValue(joseError('JWTExpired', 'ERR_JWT_EXPIRED'));
    const { context, request } = protectedContext();

    await guard.canActivate(context).catch(() => undefined);

    expect(request['user']).toBeUndefined();
  });
});
