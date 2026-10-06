import { SetMetadata } from '@nestjs/common';
import { Role } from '@medcenter/contracts';

export const REQUIRES_ROLES_KEY = 'requiresRoles';

/** Declares the RBAC roles a route demands; checked by `RoleGuard`. */
export const RequiresRoles = (...roles: Role[]): MethodDecorator =>
  SetMetadata(REQUIRES_ROLES_KEY, roles);
