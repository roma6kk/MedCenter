import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { RevokeConsentRequest } from '@medcenter/contracts';
import { IsISO8601, IsOptional, IsString, Length, Matches } from 'class-validator';

/** API §3.9 body: the written application that revoked the consent. */
export class RevokeConsentDto implements RevokeConsentRequest {
  @ApiProperty({ description: 'Number of the written revocation application', minLength: 1, maxLength: 64 })
  @IsString()
  @Length(1, 64)
  @Matches(/\S/, { message: 'applicationNumber must not be blank' })
  readonly applicationNumber!: string;

  @ApiPropertyOptional({ description: 'Revocation date (ISO 8601); defaults to today', example: '2026-10-20' })
  @IsOptional()
  @IsISO8601()
  readonly revokedAt?: string;
}
