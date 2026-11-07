import { ForbiddenException } from '@nestjs/common';
import { hasScope, type JwtClaims } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';

export type ScopeAccess = 'read' | 'write';

const SCOPE_BY_ROLE: Partial<Readonly<Record<string, Readonly<Record<ScopeAccess, string>>>>> = {
  [Role.PATIENT]: { read: SMART_SCOPES.PATIENT_READ, write: SMART_SCOPES.PATIENT_WRITE },
  [Role.DOCTOR]: { read: SMART_SCOPES.USER_READ, write: SMART_SCOPES.USER_WRITE },
  [Role.ADMIN]: { read: SMART_SCOPES.USER_READ, write: SMART_SCOPES.USER_WRITE },
};

/** `@RequiresScopes` needs every listed scope, so routes shared by patients and staff pick the scope by role here. */
export function assertRoleScope(claims: JwtClaims, access: ScopeAccess): void {
  const required = SCOPE_BY_ROLE[claims.role]?.[access];
  if (required === undefined) {
    throw new ForbiddenException({ errorCode: 'FORBIDDEN_ROLE', message: `Role ${claims.role} has no ${access} access here` });
  }
  if (!hasScope(claims, required)) {
    throw new ForbiddenException({ errorCode: 'FORBIDDEN_SCOPE', message: `Missing required scope ${required}` });
  }
}
