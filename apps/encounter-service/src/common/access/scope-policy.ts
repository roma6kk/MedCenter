import { ForbiddenException } from '@nestjs/common';
import { hasScope, type JwtClaims } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';

const READ_SCOPE_BY_ROLE: Partial<Readonly<Record<string, string>>> = {
  [Role.PATIENT]: SMART_SCOPES.PATIENT_READ,
  [Role.DOCTOR]: SMART_SCOPES.USER_READ,
  [Role.ADMIN]: SMART_SCOPES.USER_READ,
};

export function assertReadScope(claims: JwtClaims): void {
  const required = READ_SCOPE_BY_ROLE[claims.role];
  if (required === undefined) {
    throw new ForbiddenException({ errorCode: 'FORBIDDEN_ROLE', message: `Role ${claims.role} has no read access here` });
  }
  if (!hasScope(claims, required)) {
    throw new ForbiddenException({ errorCode: 'FORBIDDEN_SCOPE', message: `Missing required scope ${required}` });
  }
}
