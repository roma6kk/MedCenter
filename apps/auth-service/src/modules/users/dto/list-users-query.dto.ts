import { MAX_PAGE_SIZE, Role } from '@medcenter/contracts';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Upper bound on `page`, so a client cannot push the database into an unbounded offset scan. */
export const MAX_PAGE = 1000;

/** API §2.2.2 `GET /api/v1/admin/users?role=&search=&page=&pageSize=` (API §0 pagination). */
export class ListUsersQueryDto {
  @ApiPropertyOptional({ enum: Role, enumName: 'Role', description: 'Only accounts with this role' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ maxLength: 100, description: 'Substring of the name or e-mail' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
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
