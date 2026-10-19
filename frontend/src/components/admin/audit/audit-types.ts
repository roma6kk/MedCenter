export type AuditAction = 'create' | 'update' | 'delete';

/** `AuditEventDto` of `GET /api/v1/admin/audit` (api-designer-spec §9.4). Some events carry no resource or no request id. */
export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly userId: string;
  readonly action: AuditAction;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly requestId: string;
}

/**
 * Resource types the journal holds today (checked against the live stack): auth-service, appointment-service and
 * encounter-service write audit events; the room, service and schedule writes of practitioner-service and catalog-service
 * leave none. Offered as suggestions only: any `Type` or `Type/id` is accepted.
 */
export const ENTITY_SUGGESTIONS: ReadonlyArray<string> = ['Appointment', 'AuthUser', 'CodeSystem', 'Condition', 'Encounter', 'Patient', 'PractitionerRole'];
