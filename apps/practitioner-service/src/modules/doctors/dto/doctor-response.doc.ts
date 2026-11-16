import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PageMetaDoc } from '../../../common/page-meta.doc';
import type { DoctorResponseDto } from './doctor-response.dto';

export class DoctorResponseDoc implements DoctorResponseDto {
  @ApiProperty({ description: 'Practitioner id (FHIR id)', example: '1234' })
  readonly id!: string;

  @ApiProperty({ description: 'Display name: given + family', example: 'Иван Иванов' })
  readonly name!: string;

  @ApiProperty({ example: 'Иван' })
  readonly firstName!: string;

  @ApiProperty({ example: 'Иванов' })
  readonly lastName!: string;

  @ApiPropertyOptional({ description: 'Patronymic (the second given name); absent when the doctor has none', example: 'Сергеевич' })
  readonly middleName?: string;

  @ApiPropertyOptional({ description: 'Display text of the specialty', example: 'Терапевт' })
  readonly specialty?: string;

  @ApiPropertyOptional({ description: 'Specialty code: the value of ?specialty= in 4.1', example: '419192003' })
  readonly specialtyCode?: string;

  @ApiPropertyOptional({ description: 'Specialty code system', example: 'http://snomed.info/sct' })
  readonly specialtySystem?: string;

  @ApiProperty({ type: String, isArray: true, description: 'Ids of the active PractitionerRoles, ascending; empty if none' })
  readonly practitionerRoleIds!: readonly string[];
}

export class DoctorPageDoc {
  @ApiProperty({ type: [DoctorResponseDoc] })
  readonly items!: DoctorResponseDoc[];

  @ApiProperty({ type: PageMetaDoc })
  readonly meta!: PageMetaDoc;
}
