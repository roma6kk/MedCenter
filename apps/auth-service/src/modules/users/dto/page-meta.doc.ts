import type { PageMetaDto } from '@medcenter/contracts';
import { ApiProperty } from '@nestjs/swagger';

/** OpenAPI description of the pagination block `meta` (API §0). */
export class PageMetaDoc implements PageMetaDto {
  @ApiProperty({ example: 1, minimum: 1 })
  page!: number;

  @ApiProperty({ example: 20, minimum: 1 })
  pageSize!: number;

  @ApiProperty({ example: 42, minimum: 0 })
  totalItems!: number;

  @ApiProperty({ example: 3, minimum: 0 })
  totalPages!: number;
}
