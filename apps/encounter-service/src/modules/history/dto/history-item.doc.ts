import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PaginatedResponseDto } from '@medcenter/contracts';

import { PageMetaDoc } from '../../../common/paging/page-meta.doc';
import { CodingDoc, DiagnosisViewDoc, ENCOUNTER_STATUSES } from '../../encounters/dto/encounter-response.doc';
import type { EncounterStatus } from '../../encounters/dto/encounter-response.dto';
import type { HistoryItemDto } from './history-item.dto';

/** Swagger description of `HistoryItemDto` (API §7.4, §7.6). */
export class HistoryItemDoc implements HistoryItemDto {
  @ApiProperty({ description: 'Encounter id (FHIR id)' })
  id!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Encounter.period.start' })
  date!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  endDate?: string;

  @ApiProperty({ enum: ENCOUNTER_STATUSES, enumName: 'EncounterStatus' })
  status!: EncounterStatus;

  @ApiProperty({ description: 'Primary ICD-10 code; empty string when the encounter has none', example: 'J06.9' })
  diagnosis!: string;

  @ApiProperty({ type: [DiagnosisViewDoc] })
  diagnoses!: DiagnosisViewDoc[];

  @ApiPropertyOptional()
  summary?: string;

  @ApiPropertyOptional()
  recommendations?: string;

  @ApiPropertyOptional({ type: CodingDoc })
  serviceType?: CodingDoc;

  @ApiProperty({ description: 'Appointment id (FHIR id)' })
  appointmentId!: string;

  @ApiProperty({ description: 'PractitionerRole id (FHIR id)' })
  practitionerRoleId!: string;

  @ApiPropertyOptional({ description: 'Doctor display name (family name first); absent when it cannot be resolved' })
  doctorName?: string;
}

/** `PaginatedResponseDto<HistoryItemDto>` for Swagger. */
export class HistoryPageDoc implements PaginatedResponseDto<HistoryItemDoc> {
  @ApiProperty({ type: [HistoryItemDoc] })
  items!: HistoryItemDoc[];

  @ApiProperty({ type: PageMetaDoc })
  meta!: PageMetaDoc;
}
