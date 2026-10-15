import { MAX_PAGE_SIZE, Role } from '@medcenter/contracts';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Upper bound on `page`, so a client cannot push the database into an unbounded offset scan. */
export const MAX_PAGE = 1000;

/** API §2.2.2 `GET /api/v1/admin/users?role=&search=&page=&pageSize=` (API §0 pagination). */
export class ListUsersQueryDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}
