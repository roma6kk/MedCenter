import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { trimString } from './trim-string';

/** API §4.4 `CreateRoomDto` — maps to a FHIR `Location` with `physicalType=room`. */
export class CreateRoomDto {
  @ApiProperty({ description: 'Unique room identifier (Location.identifier)', maxLength: 50, example: '204-Х' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  identifier!: string;

  @ApiProperty({ maxLength: 200, example: 'Кабинет 204' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  floor?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
