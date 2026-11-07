import type { NotificationKind } from '../notification-kind';

export interface NotificationResponseDto {
  readonly id: string;
  readonly category: string;
  readonly text: string;
  readonly sent: string;
  readonly read: boolean;
  /** Absent for notifications stored before the kind existed. */
  readonly kind?: NotificationKind;
  readonly start?: string;
  readonly appointmentId?: string;
  readonly encounterId?: string;
}
