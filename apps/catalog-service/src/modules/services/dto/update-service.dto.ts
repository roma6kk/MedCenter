import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * API §5.1.4 `UpdateServiceDto` — every field optional. Written explicitly
 * because `@nestjs/mapped-types` is not a workspace dependency.
 */
export class UpdateServiceDto {
  @ApiPropertyOptional({ maxLength: 200, example: 'Консультация терапевта' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Canonical code system of the НСИ service type',
    example: 'https://fhir.by/CodeSystem/nsi-services',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  typeSystem?: string;

  @ApiPropertyOptional({
    maxLength: 50,
    description: 'Service code from the НСИ',
    example: '01.001',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  typeCode?: string;

  @ApiPropertyOptional({
    minimum: 5,
    maximum: 240,
    example: 30,
    description: 'Default visit duration, minutes',
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  defaultDurationMin?: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** English name: stored as the HL7 `translation` extension of `HealthcareService.name`; a blank string removes it. */
  @ApiPropertyOptional({ maxLength: 200, example: 'Therapist consultation' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  /** English description: the `translation` extension of `HealthcareService.comment`; a blank string removes it. */
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionEn?: string;

  /** `false` takes the service off the public catalogue without deleting it; absent means active on create, unchanged on update. */
  @ApiPropertyOptional({ description: 'false hides the service from the public catalogue' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: String,
    isArray: true,
    description: 'PractitionerRole.specialty codes',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @IsString({ each: true })
  specialtyCodes?: string[];
}
