import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateAppointmentDto {
  /** Slot id; `Slot.status` must be `free` (checked atomically at write time, ADR-012). */
  @IsUUID()
  slotId!: string;

  /** Must match the slot's schedule service when supplied; defaults to it otherwise. */
  @IsOptional()
  @IsString()
  serviceId?: string;

  /** Stored as `Appointment.reasonCode[0].text`. */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}
