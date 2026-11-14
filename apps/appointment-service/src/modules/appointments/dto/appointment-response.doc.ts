import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { APPOINTMENT_CANCEL_REASON_CODES, type AppointmentCancelReasonCode, type PageMetaDto } from '@medcenter/contracts';
import type { AppointmentResponseDto } from '@medcenter/fhir-mappers';

import type { AppointmentViewDto } from './appointment-view.dto';

export class PageMetaDoc implements PageMetaDto {
  @ApiProperty({ minimum: 1, example: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100, example: 20 })
  pageSize!: number;

  @ApiProperty({ minimum: 0, example: 42 })
  totalItems!: number;

  @ApiProperty({ minimum: 0, example: 3 })
  totalPages!: number;
}

export class AppointmentResponseDoc implements AppointmentResponseDto {
  @ApiProperty({ description: 'Appointment id (FHIR id)', example: '3001' })
  id!: string;

  @ApiProperty({
    enum: ['booked', 'cancelled', 'noshow', 'fulfilled'],
    enumName: 'AppointmentStatus',
  })
  status!: 'booked' | 'cancelled' | 'noshow' | 'fulfilled';

  @ApiProperty({ format: 'date-time', example: '2026-11-02T06:00:00.000Z' })
  start!: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-02T06:30:00.000Z' })
  end!: string;

  @ApiProperty({ description: 'Slot id', example: '3f2a9c0d' })
  slotId!: string;

  @ApiProperty({ description: 'Patient id', example: '1001' })
  patientId!: string;

  @ApiProperty({ description: 'Practitioner id', example: '1042' })
  doctorId!: string;

  @ApiProperty({ description: 'PractitionerRole id', example: '1043' })
  practitionerRoleId!: string;

  @ApiProperty({ description: 'HealthcareService id', example: '1044' })
  serviceId!: string;

  @ApiPropertyOptional({
    enum: APPOINTMENT_CANCEL_REASON_CODES,
    enumName: 'AppointmentCancelReason',
    description: 'Cancellation reason code; free text stored before the codes existed reads as `other`',
  })
  cancelReason?: AppointmentCancelReasonCode;

  @ApiProperty({ format: 'date-time', example: '2026-10-23T08:15:00.000Z' })
  createdAt!: string;
}

export class AppointmentViewDoc extends AppointmentResponseDoc implements AppointmentViewDto {
  @ApiPropertyOptional({ description: 'Practitioner.name of the PractitionerRole participant' })
  doctorName?: string;

  @ApiPropertyOptional({ description: 'HealthcareService.name of the service participant' })
  serviceName?: string;

  @ApiPropertyOptional({ description: 'Patient.name of the patient participant' })
  patientName?: string;
}

export class AppointmentPageDoc {
  @ApiProperty({ type: [AppointmentViewDoc] })
  items!: AppointmentViewDoc[];

  @ApiProperty({ type: PageMetaDoc })
  meta!: PageMetaDoc;
}
