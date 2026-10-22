export interface NotificationResponseDto {
  readonly id: string;
  readonly category: string;
  readonly text: string;
  readonly sent: string;
  readonly read: boolean;
  /** Id of the appointment the notification is about (`Communication.about`); absent for other notifications and older ones. */
  readonly appointmentId?: string;
  /** Id of the encounter a «visit completed» notification is about. */
  readonly encounterId?: string;
}
