import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { JwtClaims, RequestWithClaims } from './request-context';

export function claimsOf(request: RequestWithClaims): JwtClaims {
  if (request.user === undefined) {
    throw new UnauthorizedException({ errorCode: 'UNAUTHENTICATED', message: 'Authentication claims are missing' });
  }
  return request.user;
}

export function requirePatientRef(claims: JwtClaims): string {
  if (claims.patient === undefined || claims.patient === '') {
    throw new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message: 'Token carries no patient context' });
  }
  return claims.patient;
}
