import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { trimString } from './trim-string';

/**
 * API §4.5 `UpdateRoomDto` — every field optional.
 *
 * Written out by hand instead of `PartialType(...)`: `@nestjs/mapped-types`
 * (and its Swagger re-export) is not a dependency of this workspace, and the
 * contract is small enough that an explicit DTO is clearer than a new package.
 *
 * A field that is absent keeps its stored value. `floor` and `description` are
 * the optional elements of a room, so `null` (and, for the text, an empty or
 * blank string) removes them — FHIR JSON has no empty strings, so the service
 * never sends one to HAPI.
 */
export class UpdateRoomDto {
  @ApiPropertyOptional({ description: 'Unique room identifier; the room own value is allowed', maxLength: 50, example: '204-Х' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  identifier?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
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
