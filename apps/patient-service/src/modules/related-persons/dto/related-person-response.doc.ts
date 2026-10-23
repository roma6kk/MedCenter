import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ADMINISTRATIVE_GENDER_VALUES, CodingDoc, ContactPointDoc, PageMetaDoc } from '../../../shared/fhir-datatypes.doc';
import type { AdministrativeGender } from '../../../shared/fhir-datatypes.mapper';
import type { RelatedPersonResponseDto } from './related-person-response.dto';

/** Swagger projection of `RelatedPersonResponseDto` (API §3.3). */
export class RelatedPersonResponseDoc implements RelatedPersonResponseDto {
  @ApiProperty({ description: 'RelatedPerson.id (FHIR id)' })
  readonly id!: string;

  @ApiProperty({ description: 'Bare id of RelatedPerson.patient' })
  readonly patientId!: string;

  @ApiProperty()
  readonly active!: boolean;

  @ApiProperty({ type: [CodingDoc], description: 'RelatedPerson.relationship (v3 RoleCode / v2-0131)' })
  readonly relationship!: readonly CodingDoc[];

  @ApiPropertyOptional({ enum: ADMINISTRATIVE_GENDER_VALUES, enumName: 'AdministrativeGender' })
  readonly gender?: AdministrativeGender;

  @ApiPropertyOptional({ example: '1960-01-31' })
  readonly birthDate?: string;

  @ApiProperty({ type: [ContactPointDoc] })
  readonly telecom!: readonly ContactPointDoc[];

  @ApiProperty({ example: 'Иванова Мария Петровна' })
  readonly fullName!: string;

  @ApiProperty()
  readonly lastName!: string;

  @ApiProperty()
  readonly firstName!: string;

  @ApiPropertyOptional()
  readonly middleName?: string;
}

/** `{ items, meta }` envelope of the related-person listing. */
export class RelatedPersonPageDoc {
  @ApiProperty({ type: [RelatedPersonResponseDoc] })
  readonly items!: RelatedPersonResponseDoc[];

  @ApiProperty({ type: PageMetaDoc })
  readonly meta!: PageMetaDoc;
}
