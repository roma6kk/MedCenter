import { ApiProperty } from '@nestjs/swagger';
import type { PageMetaDto } from '@medcenter/contracts';

/** Documentation class of the pagination envelope `meta` (API §0). */
export class PageMetaDoc implements PageMetaDto {
  @ApiProperty({ minimum: 1, example: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100, example: 20 })
  pageSize!: number;

  @ApiProperty({ minimum: 0, example: 42 })
  totalItems!: number;

  @ApiProperty({ minimum: 0, example: 3 })
  totalPages!: number;
}
