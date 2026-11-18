import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

import { isPresent } from './is-present';
import { trimString } from './trim-string';

// Written by hand: `@nestjs/mapped-types` is not a dependency. `null` on identifier/name is 400; on floor/description it removes them.
export class UpdateRoomDto {
  @ApiPropertyOptional({ description: 'Unique room identifier; the room own value is allowed', maxLength: 50, example: '204-Х' })
  @ValidateIf(isPresent)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  identifier?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @ValidateIf(isPresent)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 10, description: 'null removes the floor' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  floor?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500, description: 'An empty (or blank) text and null remove the description' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
