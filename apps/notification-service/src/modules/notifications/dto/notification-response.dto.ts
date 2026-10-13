export interface NotificationResponseDto {
  readonly id: string;
  readonly category: string;
  readonly text: string;
  readonly sent: string;
  readonly read: boolean;
}
