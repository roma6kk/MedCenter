import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelAppointmentDto {
  /** Stored as `Appointment.cancelationReason.text` (API §6.4, BR-002). */
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
