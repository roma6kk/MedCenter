import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';
import type { FieldErrorDetail } from '@medcenter/contracts';

/** Flattens class-validator's error tree into `{ field: 'diagnoses.0.code', message }` entries. */
export function toFieldErrors(errors: readonly ValidationError[], parent = ''): FieldErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent === '' ? error.property : `${parent}.${error.property}`;
    const own = Object.values(error.constraints ?? {}).map((message): FieldErrorDetail => ({ field, message }));
    return [...own, ...toFieldErrors(error.children ?? [], field)];
  });
}

/**
 * API §1: a failed DTO validation is `400 VALIDATION_ERROR` whose `detail` names
 * the violated fields and whose `details[]` lists them one by one. Without this the
 * default `BadRequestException` carries a message array that `ProblemDetailsFilter`
 * cannot read, and the client only sees "Bad Request Exception".
 */
export function validationException(errors: readonly ValidationError[]): BadRequestException {
  const details = toFieldErrors(errors);
  return new BadRequestException({
    errorCode: 'VALIDATION_ERROR',
    message: details.map((detail) => `${detail.field}: ${detail.message}`).join('; '),
    details,
  });
}

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
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: false,
    exceptionFactory: validationException,
  });
}
