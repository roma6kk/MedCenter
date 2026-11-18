import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { APPOINTMENT_CANCEL_REASON_CODES, type AppointmentCancelReasonCode } from '@medcenter/contracts';

export class CancelAppointmentDto {
  @ApiProperty({
    enum: APPOINTMENT_CANCEL_REASON_CODES,
    enumName: 'AppointmentCancelReason',
    example: 'plans-changed',
    description: 'Neutral reason code, never free text; stored as Appointment.cancelationReason',
  })
  @IsIn(APPOINTMENT_CANCEL_REASON_CODES)
  reason!: AppointmentCancelReasonCode;
}
