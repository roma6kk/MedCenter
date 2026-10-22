import type { RevokeConsentRequest } from '@medcenter/contracts';
import { IsISO8601, IsOptional, IsString, Length, Matches } from 'class-validator';

/** API §3.9 body: the written application that revoked the consent. */
export class RevokeConsentDto implements RevokeConsentRequest {
  @IsString()
  @Length(1, 64)
  @Matches(/\S/, { message: 'applicationNumber must not be blank' })
  readonly applicationNumber!: string;

  @IsOptional()
  @IsISO8601()
  readonly revokedAt?: string;
}
