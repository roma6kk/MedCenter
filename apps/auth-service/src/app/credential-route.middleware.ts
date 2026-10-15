import type { NextFunction, Request, Response } from 'express';

/** The two public routes that take credentials and are therefore worth brute-forcing. */
export const LOGIN_ROUTE = '/oauth/login';
export const REGISTER_ROUTE = '/api/v1/auth/register';

/**
 * Pins the rate-limit bucket of a credential route to the caller's address.
 *
 * `RateLimitGuard` (shared, mounted through `APP_GUARD`) keys an
 * unauthenticated request on `${body.client_id}|${ip}` plus
 * `${method}:${originalUrl}`. That suits `POST /oauth/token`, where
 * `TokenClientGuard` rejects an unknown `client_id` before any secret is
 * checked — but `POST /oauth/login` and `POST /api/v1/auth/register` never
 * look at the field, so every request carrying a fresh `client_id` landed in a
 * fresh `@RateLimit` bucket and the limit was void. The same hole is open
 * through the URL: Express routes `/OAUTH/Login/` and `/oauth/login?n=2` to
 * the very same handler, each under another key.
 *
 * Middleware runs before the guards, so it removes both degrees of freedom:
 * the body loses `client_id` (no DTO of these routes reads it) and
 * `originalUrl` becomes the canonical path. What is left in the key is the
 * client IP (`trust proxy`, see `main.ts`) and the fixed route.
 */
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
