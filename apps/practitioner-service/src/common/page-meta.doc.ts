import { ApiProperty } from '@nestjs/swagger';

export class PageMetaDoc {
  @ApiProperty({ minimum: 1, example: 1 })
  readonly page!: number;

  @ApiProperty({ minimum: 1, maximum: 100, example: 20 })
  readonly pageSize!: number;

  @ApiProperty({ minimum: 0, example: 1 })
  readonly totalItems!: number;

  @ApiProperty({ minimum: 0, example: 1 })
  readonly totalPages!: number;
}
