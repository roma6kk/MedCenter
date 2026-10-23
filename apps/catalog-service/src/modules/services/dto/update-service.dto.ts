import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
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
