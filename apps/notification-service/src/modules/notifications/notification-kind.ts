/** `Communication.topic` coding: clients word the notification from the kind in the user's language; the Russian text is a fallback. */
export const NOTIFICATION_KIND_SYSTEM = 'https://fhir.by/CodeSystem/notification-kind';

export const NOTIFICATION_KINDS = [
  'appointment.booked',
  'appointment.cancelled',
  'appointment.cancelled.by-admin',
  'appointment.noshow',
  'encounter.completed',
  'patient.registered',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === 'string' && (NOTIFICATION_KINDS as readonly string[]).includes(value);
}
