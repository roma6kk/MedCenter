import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateServiceDto {
  @ApiProperty({ maxLength: 200, example: 'Консультация терапевта' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    maxLength: 255,
    description: 'Canonical code system of the НСИ service type',
    example: 'https://fhir.by/CodeSystem/nsi-services',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  typeSystem!: string;

  @ApiProperty({ maxLength: 50, description: 'Service code from the НСИ', example: '01.001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  typeCode!: string;

  @ApiProperty({
    minimum: 5,
    maximum: 240,
    example: 30,
    description: 'Default visit duration, minutes',
  })
  @IsInt()
  @Min(5)
  @Max(240)
  defaultDurationMin!: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ maxLength: 200, example: 'Therapist consultation' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionEn?: string;

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
