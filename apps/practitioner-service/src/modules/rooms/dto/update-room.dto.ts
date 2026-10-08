import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * API §4.5 `UpdateRoomDto` — every field optional.
 *
 * Written out by hand instead of `PartialType(...)`: `@nestjs/mapped-types`
 * (and its Swagger re-export) is not a dependency of this workspace, and the
 * contract is small enough that an explicit DTO is clearer than a new package.
 */
export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  identifier?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

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
