export const OUTBOX = {
  CODE_SYSTEM: 'https://fhir.by/CodeSystem/outbox',
  EVENT_CODE: 'outbox-event',
  STATUS_SYSTEM: 'https://fhir.by/CodeSystem/outbox-status',
  PENDING: 'pending',
  SENT: 'sent',
} as const;

export type OutboxStatus = typeof OUTBOX.PENDING | typeof OUTBOX.SENT;
