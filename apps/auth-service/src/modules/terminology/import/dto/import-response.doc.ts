import { ApiProperty } from '@nestjs/swagger';

import type { ImportAcceptedDto } from './import-response.dto';

/** OpenAPI description of `ImportAcceptedDto` (API 2.3.4). */
export class ImportAcceptedDoc implements ImportAcceptedDto {
  @ApiProperty({ description: 'Correlates the log lines and AuditEvents of this import' })
  importId!: string;

  @ApiProperty({ example: '1.4.463' })
  snapshotVersion!: string;

  @ApiProperty({ enum: ['ACCEPTED'] })
  status!: 'ACCEPTED';

  @ApiProperty({ type: String, format: 'date-time' })
  acceptedAt!: string;
}
