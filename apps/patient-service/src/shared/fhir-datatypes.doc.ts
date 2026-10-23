import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { AdministrativeGender, CodingDto, ContactPointDto, IdentifierDto } from './fhir-datatypes.mapper';

export const ADMINISTRATIVE_GENDER_VALUES: readonly AdministrativeGender[] = ['male', 'female', 'other', 'unknown'];

/** Swagger projection of `ContactPointDto` (R4 `ContactPoint`). */
export class ContactPointDoc implements ContactPointDto {
  @ApiProperty({ description: 'ContactPoint.system', example: 'phone' })
  readonly system!: string;

  @ApiProperty({ description: 'ContactPoint.value', example: '+375291234567' })
  readonly value!: string;

  @ApiPropertyOptional({ description: 'ContactPoint.use', example: 'mobile' })
  readonly use?: string;
}

/** Swagger projection of `IdentifierDto` (R4 `Identifier`). */
export class IdentifierDoc implements IdentifierDto {
  @ApiPropertyOptional({ description: 'Identifier.system', example: 'https://fhir.by/identifier/personal-number' })
  readonly system?: string;

  @ApiProperty({ description: 'Identifier.value' })
  readonly value!: string;

  @ApiPropertyOptional({ description: 'Identifier.use', example: 'official' })
  readonly use?: string;
}

/** Swagger projection of `CodingDto` (R4 `Coding`, display always present). */
export class CodingDoc implements CodingDto {
  @ApiPropertyOptional({ description: 'Coding.system' })
  readonly system?: string;

  @ApiPropertyOptional({ description: 'Coding.code' })
  readonly code?: string;

  @ApiProperty({ description: 'Coding.display (or the concept text)' })
  readonly display!: string;
}

/** `{ page, pageSize, totalItems, totalPages }` of the API §0 paging envelope. */
export class PageMetaDoc {
  @ApiProperty({ minimum: 1, example: 1 })
  readonly page!: number;

  @ApiProperty({ minimum: 1, maximum: 100, example: 20 })
  readonly pageSize!: number;

  @ApiProperty({ minimum: 0, example: 1 })
  readonly totalItems!: number;

  @ApiProperty({ minimum: 0, example: 1 })
  readonly totalPages!: number;
}
