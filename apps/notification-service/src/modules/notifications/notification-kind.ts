/**
 * `Communication.topic` coding: which event a notification came from. The stored text is Russian, so a client words
 * the notification itself from the kind (and the start for a booking) in the user's language (NFR-008) and shows
 * the text only for a notification stored before the kind existed.
 */
export const NOTIFICATION_KIND_SYSTEM = 'https://fhir.by/CodeSystem/notification-kind';

/** The stable identifiers of `kind` in API §8.1. A cancellation by the clinic is a kind of its own: it is worded differently. */
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
