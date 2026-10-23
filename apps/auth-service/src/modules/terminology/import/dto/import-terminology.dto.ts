import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

/** API 2.3.4 body. A release number such as `1.4.463`; whether that release is bundled is the service's call (422). */
export class ImportTerminologyDto {
  @ApiProperty({ example: '1.4.463', maxLength: 32, pattern: '^\\d+(\\.\\d+){0,3}$', description: 'Release number of a bundled snapshot' })
  @IsString()
  @MaxLength(32)
  @Matches(/^\d+(\.\d+){0,3}$/, { message: '$property must be a release number such as 1.4.463' })
  snapshotVersion!: string;
}
