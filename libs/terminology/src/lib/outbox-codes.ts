/**
 * Codes of the transactional-outbox record (ADR-021): a FHIR `Basic` whose
 * `code` is `outbox-event` and whose delivery state is a `meta.tag`.
 */
export const OUTBOX = {
  /** `Basic.code.coding.system`. */
  CODE_SYSTEM: 'https://fhir.by/CodeSystem/outbox',
  /** `Basic.code.coding.code` of every outbox record. */
  EVENT_CODE: 'outbox-event',
  /** `meta.tag.system` of the delivery state. */
  STATUS_SYSTEM: 'https://fhir.by/CodeSystem/outbox-status',
  /** Written with the business change; not yet handed to the broker. */
  PENDING: 'pending',
  /** Confirmed by the broker; kept until the retention window ends, then expunged. */
  SENT: 'sent',
} as const;

export type OutboxStatus = typeof OUTBOX.PENDING | typeof OUTBOX.SENT;
