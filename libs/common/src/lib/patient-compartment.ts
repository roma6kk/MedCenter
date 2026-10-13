import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { JwtClaims, RequestWithClaims } from './request-context';

/** Claims attached by `JwtAuthGuard`; the guard already rejects anonymous calls, this is the type narrowing. */
export function claimsOf(request: RequestWithClaims): JwtClaims {
  if (request.user === undefined) {
    throw new UnauthorizedException({ errorCode: 'UNAUTHENTICATED', message: 'Authentication claims are missing' });
  }
  return request.user;
}

/**
 * Patient compartment (ADR-013): the patient is taken from the token only, never
 * from a request parameter. A PATIENT token without a `patient` claim is refused.
 */
export function requirePatientRef(claims: JwtClaims): string {
  if (claims.patient === undefined || claims.patient === '') {
    throw new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message: 'Token carries no patient context' });
  }
  return claims.patient;
}
