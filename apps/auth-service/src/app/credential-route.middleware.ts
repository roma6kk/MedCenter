import type { NextFunction, Request, Response } from 'express';

export const LOGIN_ROUTE = '/oauth/login';
export const REGISTER_ROUTE = '/api/v1/auth/register';

/** Pins the credential routes' rate-limit bucket to the caller IP: `RateLimitGuard` would otherwise key on the (attacker-chosen) body client_id. */
export function pinCredentialRouteBucket(canonicalPath: string): (
  request: Request,
  response: Response,
  next: NextFunction,
) => void {
  return (request, _response, next): void => {
    request.originalUrl = canonicalPath;
    const body: unknown = request.body;
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      delete (body as Record<string, unknown>)['client_id'];
    }
    next();
  };
}
