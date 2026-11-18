import { MAX_PAGE_SIZE, Role } from '@medcenter/contracts';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { NO_CONTROL_CHARS, NO_CONTROL_CHARS_MESSAGE } from './validation-patterns';

export const MAX_PAGE = 1000;

export class ListUsersQueryDto {
  @ApiPropertyOptional({ enum: Role, enumName: 'Role', description: 'Only accounts with this role' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ maxLength: 100, description: 'Substring of the name or e-mail' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(NO_CONTROL_CHARS, { message: NO_CONTROL_CHARS_MESSAGE })
  search?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: MAX_PAGE, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}
