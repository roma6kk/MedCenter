export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'read'
  | 'denied'
  | 'emergency-bypass'
  | 'login'
  | 'login-failed'
  | 'login-throttled'
  | 'logout'
  | 'session-idle';

export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly userId: string;
  readonly action: AuditAction;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly requestId: string;
  readonly reason?: string;
}

export const ENTITY_SUGGESTIONS: ReadonlyArray<string> = ['Appointment', 'AuthUser', 'CodeSystem', 'Condition', 'Encounter', 'Patient', 'PractitionerRole'];
