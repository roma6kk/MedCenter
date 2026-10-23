/**
 * `read` is a read of patient data by a doctor or administrator, `denied` a read the compartment rule refused (ADR-018),
 * `emergency-bypass` an encounter opened or completed without the patient's consent because of an emergency reason (ADR-019).
 */
export type AuditAction = 'create' | 'update' | 'delete' | 'read' | 'denied' | 'emergency-bypass';

/** `AuditEventDto` of `GET /api/v1/admin/audit` (api-designer-spec §9.4). Some events carry no resource or no request id. */
export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly userId: string;
  readonly action: AuditAction;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly requestId: string;
  /** Only an `emergency-bypass` event has one: the reason the doctor gave. */
  readonly reason?: string;
}

/**
 * Resource types the journal holds today (checked against the live stack): auth-service, appointment-service and
 * encounter-service write audit events; the room, service and schedule writes of practitioner-service and catalog-service
 * leave none. Offered as suggestions only: any `Type` or `Type/id` is accepted.
 */
export const ENTITY_SUGGESTIONS: ReadonlyArray<string> = ['Appointment', 'AuthUser', 'CodeSystem', 'Condition', 'Encounter', 'Patient', 'PractitionerRole'];
