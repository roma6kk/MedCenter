import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PaginatedResponseDto } from '@medcenter/contracts';

import { PageMetaDoc } from '../../../common/paging/page-meta.doc';
import type { MedicationPrescriptionDto, ServicePrescriptionDto } from './prescription-item.dto';

/** Swagger description of `MedicationPrescriptionDto` (`kind: 'medication'`). */
export class MedicationPrescriptionDoc implements MedicationPrescriptionDto {
  @ApiProperty({ description: 'MedicationRequest id (FHIR id)' })
  id!: string;

  @ApiProperty({ example: 'active' })
  status!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  authoredOn?: string;

  @ApiPropertyOptional({ description: 'Encounter the prescription was made in (BR-005)' })
  encounterId?: string;

  @ApiPropertyOptional({ description: 'Condition the prescription is for (BR-005)' })
  reasonConditionId?: string;

  @ApiPropertyOptional()
  note?: string;

  @ApiProperty({ enum: ['medication'] })
  kind!: 'medication';

  @ApiProperty({ example: 'J01FA10' })
  atcCode!: string;

  @ApiPropertyOptional()
  atcDisplay?: string;

  @ApiProperty({ example: '1 таб 3 раза в день после еды' })
  dosageText!: string;
}

/** Swagger description of `ServicePrescriptionDto` (`kind: 'service'`). */
export class ServicePrescriptionDoc implements ServicePrescriptionDto {
  @ApiProperty({ description: 'ServiceRequest id (FHIR id)' })
  id!: string;

  @ApiProperty({ example: 'active' })
  status!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  authoredOn?: string;

  @ApiPropertyOptional({ description: 'Encounter the prescription was made in (BR-005)' })
  encounterId?: string;

  @ApiPropertyOptional({ description: 'Condition the prescription is for (BR-005)' })
  reasonConditionId?: string;

  @ApiPropertyOptional()
  note?: string;

  @ApiProperty({ enum: ['service'] })
  kind!: 'service';

  @ApiProperty({ example: 'https://fhir.by/CodeSystem/nsi-services' })
  codeSystem!: string;

  @ApiProperty()
  code!: string;

  @ApiPropertyOptional()
  display?: string;
}

/** `PaginatedResponseDto<PrescriptionItemDto>` for Swagger; items are discriminated by `kind`. */
export class PrescriptionPageDoc implements PaginatedResponseDto<MedicationPrescriptionDoc | ServicePrescriptionDoc> {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [{ $ref: '#/components/schemas/MedicationPrescriptionDoc' }, { $ref: '#/components/schemas/ServicePrescriptionDoc' }],
    },
  })
  items!: Array<MedicationPrescriptionDoc | ServicePrescriptionDoc>;

  @ApiProperty({ type: PageMetaDoc })
  meta!: PageMetaDoc;
}
