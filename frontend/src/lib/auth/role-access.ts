/**
 * role-access — pure client-side role gate for the route groups (frontend-design-spec §1).
 *
 * Role gating in the UI is UX only: the BFF guard layer (ADR-009) is the authority.
 * Kept free of React and router imports so the decision table is unit-testable.
 */
import type { UserRole } from './user-role';

export type RoleAccess = 'wait' | 'allow' | 'login' | 'forbidden';

export interface RoleSnapshot {
  readonly hydrated: boolean;
  readonly role: UserRole | null;
}

export function resolveRoleAccess(required: UserRole, snapshot: RoleSnapshot): RoleAccess {
  if (!snapshot.hydrated) return 'wait';
  if (snapshot.role === null) return 'login';
  return snapshot.role === required ? 'allow' : 'forbidden';
}
