import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '@medcenter/common';

export class CancelAppointmentDto {
  /** Stored as `Appointment.cancelationReason.text` (API §6.4, BR-002); trimmed first, so blank text is not a reason. */
  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    example: 'Не смогу прийти',
    description: 'Stored as the cancellation reason',
  })
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
