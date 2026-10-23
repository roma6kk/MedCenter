import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { trimString } from './trim-string';

/** API §4.4 `CreateRoomDto` — maps to a FHIR `Location` with `physicalType=room`. */
export class CreateRoomDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  identifier!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  floor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
