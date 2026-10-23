import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ADMINISTRATIVE_GENDER_VALUES, ContactPointDoc, IdentifierDoc } from '../../../shared/fhir-datatypes.doc';
import type { AdministrativeGender } from '../../../shared/fhir-datatypes.mapper';
import type { PatientResponseDto } from './patient-response.dto';

/** Swagger projection of `PatientResponseDto` (API §3.1–3.2, 3.12). */
export class PatientResponseDoc implements PatientResponseDto {
  @ApiProperty({ description: 'Patient.id (FHIR id)', example: '1234' })
  readonly id!: string;

  @ApiPropertyOptional({ description: 'Patient.meta.versionId: send it back as If-Match in 3.12', example: '3' })
  readonly version?: string;

  @ApiProperty({ description: 'Patient.active; absent in FHIR means in use' })
  readonly active!: boolean;

  @ApiPropertyOptional({ description: 'Patient.birthDate (YYYY, YYYY-MM or YYYY-MM-DD)', example: '1985-04-12' })
  readonly birthDate?: string;

  @ApiPropertyOptional({ enum: ADMINISTRATIVE_GENDER_VALUES, enumName: 'AdministrativeGender' })
  readonly gender?: AdministrativeGender;

  @ApiPropertyOptional({ description: 'Patient.photo[0].url' })
  readonly photoUrl?: string;

  @ApiProperty({ type: [ContactPointDoc] })
  readonly telecom!: readonly ContactPointDoc[];

  @ApiProperty({ type: [IdentifierDoc] })
  readonly identifiers!: readonly IdentifierDoc[];

  @ApiProperty({ description: 'Family, given and middle name in the Belarusian order', example: 'Иванов Иван Иванович' })
  readonly fullName!: string;

  @ApiProperty({ example: 'Иванов' })
  readonly lastName!: string;

  @ApiProperty({ example: 'Иван' })
  readonly firstName!: string;

  @ApiPropertyOptional({ example: 'Иванович' })
  readonly middleName?: string;
}
