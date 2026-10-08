import type { ExecutionContext } from '@nestjs/common';

import { OAuthError } from '../oauth-error';
import { AuthorizePageGuard } from './authorize-page.guard';

function createContext(query: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ query }) }),
  } as unknown as ExecutionContext;
}

function activateAndCaptureError(guard: AuthorizePageGuard, context: ExecutionContext): OAuthError {
  try {
    guard.canActivate(context);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(OAuthError);
    return error as OAuthError;
  }
  throw new Error('the guard was expected to reject the request');
}

describe('AuthorizePageGuard', () => {
  const guard = new AuthorizePageGuard();
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

  it('should allow the request when the method is S256 and a challenge is present', () => {
    expect(
      guard.canActivate(
        createContext({
          response_type: 'code',
          code_challenge_method: 'S256',
          code_challenge: challenge,
        }),
      ),
    ).toBe(true);
  });

  it('should answer invalid_request when the response_type is absent', () => {
    // RFC 6749 §4.1.1: `response_type` is REQUIRED (N4).
    const error = activateAndCaptureError(
      guard,
      createContext({ code_challenge_method: 'S256', code_challenge: challenge }),
    );

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      error: 'invalid_request',
      error_description: 'response_type must be code',
    });
  });

  it('should answer invalid_request when the method is plain', () => {
    const error = activateAndCaptureError(
      guard,
      createContext({
        response_type: 'code',
        code_challenge_method: 'plain',
        code_challenge: challenge,
      }),
    );

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      error: 'invalid_request',
      error_description: 'code_challenge_method must be S256',
    });
  });

  it('should answer invalid_request when the method is absent', () => {
    const error = activateAndCaptureError(
      guard,
      createContext({ response_type: 'code', code_challenge: challenge }),
    );

    expect(error.getResponse()).toMatchObject({ error: 'invalid_request' });
  });

  it('should answer invalid_request when the method is lowercase', () => {
    const error = activateAndCaptureError(
      guard,
      createContext({
        response_type: 'code',
        code_challenge_method: 's256',
        code_challenge: challenge,
      }),
    );

    expect(error.getResponse()).toMatchObject({ error: 'invalid_request' });
  });

  it('should answer invalid_request when the challenge is missing', () => {
    const error = activateAndCaptureError(
      guard,
      createContext({ response_type: 'code', code_challenge_method: 'S256' }),
    );

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      error: 'invalid_request',
      error_description: 'code_challenge is required',
    });
  });

  it('should answer invalid_request when the challenge is empty', () => {
    const error = activateAndCaptureError(
      guard,
      createContext({ response_type: 'code', code_challenge_method: 'S256', code_challenge: '' }),
    );

    expect(error.getResponse()).toMatchObject({ error: 'invalid_request' });
  });

  it('should answer invalid_request when the response_type is not code', () => {
    const error = activateAndCaptureError(
      guard,
      createContext({
        response_type: 'token',
        code_challenge_method: 'S256',
        code_challenge: challenge,
      }),
    );

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      error: 'invalid_request',
      error_description: 'response_type must be code',
    });
  });

  it('should allow the request when response_type is code', () => {
    expect(
      guard.canActivate(
        createContext({
          response_type: 'code',
          code_challenge_method: 'S256',
          code_challenge: challenge,
        }),
      ),
    ).toBe(true);
  });

  it('should answer invalid_request when the challenge is not a string', () => {
    const error = activateAndCaptureError(
      guard,
      createContext({
        response_type: 'code',
        code_challenge_method: 'S256',
        code_challenge: ['a', 'b'],
      }),
    );

    expect(error.getResponse()).toMatchObject({ error: 'invalid_request' });
  });
});
