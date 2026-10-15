import { Reflector } from '@nestjs/core';
import * as jose from 'jose';

import { captureAsyncHttpException, createMockHttpContext } from '../../__tests__/mock-context';
import { JwtAuthGuard } from './jwt-auth.guard';

// `jose` ships pure ESM and is imported lazily by the guard; mocking it keeps the
// suite offline and lets each case choose the error `jwtVerify` raises.
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

/** A `jose` error as the library raises it: a named `Error` with a stable `code`. */
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

/**
 * API §1: an expired, forged or otherwise invalid JWT is `401 UNAUTHENTICATED`.
 *
 * KNOWN DEFECT (escalated in tasks/TASK-001/test-generator-platform-report.md,
 * first reported by coder-patient-service): `verifyBearerToken` lets the `jose`
 * error escape, `ProblemDetailsFilter` sees a non-HTTP exception and answers
 * `500 INTERNAL`, so a client cannot tell that its access token only needs a
 * refresh. The `it.failing` cases below state the contract and stay green while
 * the defect exists; once the guard maps these errors they fail with
 * "Failing test passed" - drop `.failing` then, and tighten the forged-signature
 * e2e of patient-service to 401.
 */
describe('JwtAuthGuard signature and claim verification errors', () => {
  const guard = new JwtAuthGuard(new Reflector());

  beforeEach(() => {
    process.env['JWT_JWKS_URI'] = 'https://api.medcenter.by/.well-known/jwks.json';
    process.env['JWT_ISSUER'] = 'https://api.medcenter.by';
    verifyMock.mockReset();
  });

  it.failing.each([
    ['an expired token', joseError('JWTExpired', 'ERR_JWT_EXPIRED')],
    ['a forged signature', joseError('JWSSignatureVerificationFailed', 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED')],
    ['a key id the issuer does not publish', joseError('JWKSNoMatchingKey', 'ERR_JWKS_NO_MATCHING_KEY')],
    ['a token of another issuer', joseError('JWTClaimValidationFailed', 'ERR_JWT_CLAIM_VALIDATION_FAILED')],
    ['a malformed token', joseError('JWSInvalid', 'ERR_JWS_INVALID')],
  ])('should reject with 401 UNAUTHENTICATED when jose reports %s', async (_label, failure) => {
    // Arrange
    verifyMock.mockRejectedValue(failure);
    const { context } = protectedContext();

    // Act
    const error = await captureAsyncHttpException(() => guard.canActivate(context));

    // Assert
    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
  });

  it('should let an unreachable JWKS endpoint surface as a server error and never as an accepted token', async () => {
    // Arrange — the issuer being down is not the caller's fault, so it must not become a 401.
    verifyMock.mockRejectedValue(joseError('JWKSTimeout', 'ERR_JWKS_TIMEOUT'));
    const { context } = protectedContext();

    // Act
    const outcome = guard.canActivate(context);

    // Assert
    await expect(outcome).rejects.toMatchObject({ code: 'ERR_JWKS_TIMEOUT' });
  });

  it('should attach no claims to the request when verification fails', async () => {
    // Arrange
    verifyMock.mockRejectedValue(joseError('JWTExpired', 'ERR_JWT_EXPIRED'));
    const { context, request } = protectedContext();

    // Act
    await guard.canActivate(context).catch(() => undefined);

    // Assert
    expect(request['user']).toBeUndefined();
  });
});
