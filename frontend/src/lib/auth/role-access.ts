import type { UserRole } from './user-role';

export type RoleAccess = 'wait' | 'allow' | 'login' | 'forbidden' | 'unavailable';

export interface RoleSnapshot {
  readonly hydrated: boolean;
  readonly role: UserRole | null;
  readonly unavailable?: boolean;
}

export function resolveRoleAccess(required: UserRole, snapshot: RoleSnapshot): RoleAccess {
  if (!snapshot.hydrated) return 'wait';
  if (snapshot.role === null) return snapshot.unavailable === true ? 'unavailable' : 'login';
  return snapshot.role === required ? 'allow' : 'forbidden';
}
