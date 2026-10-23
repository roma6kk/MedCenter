import type { UpdateMyPatientRequest } from '@medcenter/contracts';
import { BELARUS_PHONE_PATTERN, normaliseBelarusPhone } from '@medcenter/contracts';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

/**
 * API §3.12 body. Only the phone is editable; every other property is dropped by
 * the whitelist. The number is normalised to `+375XXXXXXXXX` before it is checked.
 */
export class UpdateMyPatientDto implements UpdateMyPatientRequest {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? (normaliseBelarusPhone(value) ?? value) : value))
  @IsString()
  @Matches(BELARUS_PHONE_PATTERN, { message: 'phone must be a Belarus number: +375 and nine digits' })
  readonly phone!: string;
}
