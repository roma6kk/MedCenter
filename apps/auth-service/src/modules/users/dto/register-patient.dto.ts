import { BELARUS_PHONE_PATTERN, normaliseBelarusPhone } from '@medcenter/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsDateString,
  IsDefined,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { PASSWORD_POLICY } from '../../../config/auth-env';
import type { PatientGender } from '../patient-provisioner';
import {
  DATE_ONLY_PATTERN,
  EMAIL_MAX_LENGTH,
  ACCOUNT_CONSENT_VERSION_MAX_LENGTH,
  GENDERS,
  isPresent,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
} from './validation-patterns';

/**
 * Consent to the processing of the account's data (art. 5 of Law 99-Z), given by ticking the
 * checkbox of the registration form. It is not the consent to the electronic medical record
 * (ADR-019): that one is a FHIR `Consent` and is never created here.
 */
export class AccountConsentDto {
  /** Only `true` is accepted: a registration without the tick is refused, not stored as `false`. */
  @ApiProperty({ type: Boolean, enum: [true], example: true, description: 'Only true is accepted' })
  @Equals(true, { message: 'accepted must be true' })
  accepted!: true;

  /** Version of the text the user agreed to, so a later change of the text can be told apart. */
  @ApiProperty({ example: '2026-10', maxLength: ACCOUNT_CONSENT_VERSION_MAX_LENGTH, description: 'Version of the consent text shown to the user' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ACCOUNT_CONSENT_VERSION_MAX_LENGTH)
  textVersion!: string;
}

/**
 * API §2.2.6 `POST /api/v1/auth/register`. The constraints mirror the
 * frontend zod schema field for field (`frontend/src/lib/contracts.ts`).
 * `@Matches(DATE_ONLY_PATTERN)` narrows `@IsDateString` to an R4 `date`.
 */
export class RegisterPatientDto {
  @ApiProperty({ example: 'ivanov@example.by', maxLength: EMAIL_MAX_LENGTH })
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @ApiProperty({ example: 'Иван', maxLength: NAME_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  firstName!: string;

  @ApiProperty({ example: 'Иванов', maxLength: NAME_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  lastName!: string;

  @ApiProperty({ format: 'password', example: 'Str0ng!Pass', maxLength: PASSWORD_MAX_LENGTH, description: 'Must satisfy the password policy' })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsStrongPassword(PASSWORD_POLICY)
  password!: string;

  @ApiProperty({ type: String, format: 'date', example: '1990-05-12' })
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN, { message: '$property must be a date (YYYY-MM-DD)' })
  birthDate!: string;

  @ApiPropertyOptional({ enum: [...GENDERS], enumName: 'PatientGender' })
  @ValidateIf(isPresent)
  @IsIn(GENDERS)
  gender?: PatientGender;

  /** Optional contact phone, `+375XXXXXXXXX`; spaces and dashes are accepted and dropped (API §2.2.6). */
  @ApiPropertyOptional({ example: '+375291234567', description: 'Belarus number: +375 and nine digits; spaces and dashes are dropped' })
  @ValidateIf(isPresent)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? (normaliseBelarusPhone(value) ?? value) : value))
  @IsString()
  @Matches(BELARUS_PHONE_PATTERN, { message: 'phone must be a Belarus number: +375 and nine digits' })
  phone?: string;

  @ApiProperty({ type: () => AccountConsentDto, description: 'Consent to the processing of the account data (not the EMR consent)' })
  @IsDefined()
  @ValidateNested()
  @Type(() => AccountConsentDto)
  accountConsent!: AccountConsentDto;
}
