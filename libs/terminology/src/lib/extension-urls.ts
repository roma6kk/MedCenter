const EXTENSION_BASE = 'https://api.medcenter.by/fhir/StructureDefinition';

export const MEDCENTER_EXT = {
  ROOM_FLOOR: `${EXTENSION_BASE}/room-floor`,
  SERVICE_DEFAULT_DURATION: `${EXTENSION_BASE}/service-default-duration`,
  SCHEDULE_SLOT_DURATION: `${EXTENSION_BASE}/schedule-slot-duration`,
  SCHEDULE_WEEKLY_WINDOWS: `${EXTENSION_BASE}/schedule-weekly-windows`,
  SCHEDULE_PLANNING_HORIZON: `${EXTENSION_BASE}/schedule-planning-horizon`,
  SLOT_ACTORS: `${EXTENSION_BASE}/slot-actors`,
  CONSENT_CONSENTER_TYPE: `${EXTENSION_BASE}/consent-consenter-type`,
  CONSENT_REPRESENTATIVE_DOCUMENT: `${EXTENSION_BASE}/consent-representative-document`,
  CONSENT_REVOCATION_NUMBER: `${EXTENSION_BASE}/consent-revocation-number`,
  NOTIFICATION_APPOINTMENT_START: `${EXTENSION_BASE}/notification-appointment-start`,
  OUTBOX_EVENT_TYPE: `${EXTENSION_BASE}/outbox-event-type`,
  OUTBOX_EVENT_ID: `${EXTENSION_BASE}/outbox-event-id`,
  OUTBOX_PAYLOAD: `${EXTENSION_BASE}/outbox-payload`,
} as const;
