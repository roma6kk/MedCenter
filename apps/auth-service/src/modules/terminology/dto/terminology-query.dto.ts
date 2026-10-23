import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { VALUE_SET_URL_PATTERN } from '../seeded-value-sets';

export const DEFAULT_EXPAND_COUNT = 20;
export const MAX_EXPAND_COUNT = 100;
const MAX_EXPAND_OFFSET = 100_000;
const URL_MESSAGE = '$property must be a ValueSet canonical under https://fhir.by/ValueSet/';

/** Paging and text filter shared by both expand routes (API 2.3.2). */
export class ExpandQueryDto {
  @ApiPropertyOptional({ maxLength: 100, description: 'Text filter over code and display' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  filter?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: MAX_EXPAND_COUNT, default: DEFAULT_EXPAND_COUNT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_EXPAND_COUNT)
  count?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: MAX_EXPAND_OFFSET, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_EXPAND_OFFSET)
  offset?: number;
}

/** `GET /terminology/value-sets/{url}/$expand`: `url` is the URL-encoded canonical. */
export class ValueSetUrlParamDto {
  @ApiProperty({ example: 'https://fhir.by/ValueSet/atc', description: 'URL-encoded ValueSet canonical under https://fhir.by/ValueSet/' })
  @Matches(VALUE_SET_URL_PATTERN, { message: URL_MESSAGE })
  url!: string;
}

/**
 * `GET /terminology/expand?system=` — the form the client (`Icd10Combobox`)
 * calls; `system` carries the ValueSet canonical.
 */
export class ExpandByCanonicalQueryDto extends ExpandQueryDto {
  @ApiProperty({ example: 'https://fhir.by/ValueSet/atc', description: 'ValueSet canonical under https://fhir.by/ValueSet/' })
  @Matches(VALUE_SET_URL_PATTERN, { message: URL_MESSAGE })
  system!: string;
}

/** `GET /terminology/validate?system=&code=` (API 2.3.3). */
export class ValidateCodeQueryDto {
  @ApiProperty({ example: 'https://fhir.by/CodeSystem/InternClassificDiseases10', maxLength: 255, description: 'Absolute http(s) URI of the code system' })
  @IsString()
  @MaxLength(255)
  @Matches(/^https?:\/\/\S+$/, { message: '$property must be an absolute http(s) URI' })
  system!: string;

  /** Codes of the seeded systems (ICD-10, ATC, UCUM, НСИ) are printable ASCII without spaces. */
  @ApiProperty({ example: 'J06.9', pattern: '^[\\x21-\\x7E]{1,64}$', description: '1-64 printable ASCII characters without spaces' })
  @IsString()
  @Matches(/^[\x21-\x7E]{1,64}$/, { message: '$property must be 1-64 printable characters without spaces' })
  code!: string;
}
