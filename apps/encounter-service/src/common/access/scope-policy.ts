import { ForbiddenException } from '@nestjs/common';
import { hasScope, type JwtClaims } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';

/**
 * SMART read scope per role (API §0 scope matrix): patients read through
 * `patient/*`, staff through `user/*`.
 */
const READ_SCOPE_BY_ROLE: Partial<Readonly<Record<string, string>>> = {
  [Role.PATIENT]: SMART_SCOPES.PATIENT_READ,
  [Role.DOCTOR]: SMART_SCOPES.USER_READ,
  [Role.ADMIN]: SMART_SCOPES.USER_READ,
};

/**
 * `@RequiresScopes` demands every listed scope, so a route shared by patients
 * and staff (API §7.4/7.5) cannot declare its scope statically; the scope is
 * picked from the caller's role instead.
 */
export function assertReadScope(claims: JwtClaims): void {
  const required = READ_SCOPE_BY_ROLE[claims.role];
  if (required === undefined) {
    throw new ForbiddenException({ errorCode: 'FORBIDDEN_ROLE', message: `Role ${claims.role} has no read access here` });
  }
  if (!hasScope(claims, required)) {
    throw new ForbiddenException({ errorCode: 'FORBIDDEN_SCOPE', message: `Missing required scope ${required}` });
  }
}
