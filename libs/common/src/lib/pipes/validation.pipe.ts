import { ValidationPipe } from '@nestjs/common';

/**
 * The body/query validation contract of every BFF service (ADR-009). It is
 * mounted once in `main.ts` through `useGlobalPipes`, and the e2e suites mount
 * the very same factory so the pipeline under test is the pipeline that ships —
 * without it every `class-validator` decorator in the service is inert.
 *
 * - `whitelist` drops properties no DTO declares, so a client cannot smuggle a
 *   field past a validator into a handler.
 * - `forbidNonWhitelisted` stays **off** on purpose. `POST /oauth/token` accepts
 *   `client_secret` (RFC 6749 §2.3.1) which no request DTO declares because
 *   `TokenClientGuard` reads the raw body *before* pipes run; rejecting unknown
 *   keys would break the client authentication this service advertises through
 *   `token_endpoint_auth_methods_supported`.
 * - `transform` builds the DTO instance the decorators run against, which is
 *   what makes `application/x-www-form-urlencoded` bodies validate at all.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false });
}
