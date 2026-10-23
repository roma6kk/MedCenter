import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PageMetaDto } from '@medcenter/contracts';
import type { AppointmentResponseDto } from '@medcenter/fhir-mappers';

import type { AppointmentViewDto } from './appointment-view.dto';

/** Documentation class of the pagination envelope `meta` (API §0). */
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

/** Documentation class of `AppointmentResponseDto` (API §6.1): the mapper interface cannot be reflected by Swagger. */
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

  @ApiPropertyOptional({ description: 'Reason of the visit (free text)' })
  reason?: string;

  @ApiPropertyOptional({ description: 'Cancellation reason (statusReason)' })
  cancelReason?: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-23T08:15:00.000Z' })
  createdAt!: string;
}

/** Documentation class of `AppointmentViewDto` (API §6.2, §6.3, §6.5): the response plus display names. */
export class AppointmentViewDoc extends AppointmentResponseDoc implements AppointmentViewDto {
  @ApiPropertyOptional({ description: 'Practitioner.name of the PractitionerRole participant' })
  doctorName?: string;

  @ApiPropertyOptional({ description: 'HealthcareService.name of the service participant' })
  serviceName?: string;

  @ApiPropertyOptional({ description: 'Patient.name of the patient participant' })
  patientName?: string;
}

/** `PaginatedResponseDto<AppointmentViewDto>` (API §0, §6.2, §6.5). */
export class AppointmentPageDoc {
  @ApiProperty({ type: [AppointmentViewDoc] })
  items!: AppointmentViewDoc[];

  @ApiProperty({ type: PageMetaDoc })
  meta!: PageMetaDoc;
}
