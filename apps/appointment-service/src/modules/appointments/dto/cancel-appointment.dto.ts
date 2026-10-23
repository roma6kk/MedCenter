import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelAppointmentDto {
  /** Stored as `Appointment.cancelationReason.text` (API §6.4, BR-002). */
  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    example: 'Не смогу прийти',
    description: 'Stored as the cancellation reason',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
