/**
 * role-access — pure client-side role gate for the route groups (frontend-design-spec §1).
 *
 * Role gating in the UI is UX only: the BFF guard layer (ADR-009) is the authority.
 * Kept free of React and router imports so the decision table is unit-testable.
 */
import type { UserRole } from './user-role';

export type RoleAccess = 'wait' | 'allow' | 'login' | 'forbidden' | 'unavailable';

export interface RoleSnapshot {
  readonly hydrated: boolean;
  readonly role: UserRole | null;
  /** The session load got no answer from auth-service: nothing is known about the visitor, who may still hold a valid refresh cookie. */
  readonly unavailable?: boolean;
}

export function resolveRoleAccess(required: UserRole, snapshot: RoleSnapshot): RoleAccess {
  if (!snapshot.hydrated) return 'wait';
  if (snapshot.role === null) return snapshot.unavailable === true ? 'unavailable' : 'login';
  return snapshot.role === required ? 'allow' : 'forbidden';
}
