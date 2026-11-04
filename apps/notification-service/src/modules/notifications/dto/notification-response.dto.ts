import type { NotificationKind } from '../notification-kind';

export interface NotificationResponseDto {
  readonly id: string;
  readonly category: string;
  readonly text: string;
  readonly sent: string;
  readonly read: boolean;
  /** Which event it is, so a client words the notification in the user's language; absent for notifications stored before it existed. */
  readonly kind?: NotificationKind;
  /** Start of the booked appointment (UTC instant) of an `appointment.booked` notification. */
  readonly start?: string;
  /** Id of the appointment the notification is about (`Communication.about`); absent for other notifications and older ones. */
  readonly appointmentId?: string;
  /** Id of the encounter a «visit completed» notification is about. */
  readonly encounterId?: string;
}
