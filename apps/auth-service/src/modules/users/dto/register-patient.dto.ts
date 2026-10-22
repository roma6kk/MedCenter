import { Type } from 'class-transformer';
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
  @Equals(true, { message: 'accepted must be true' })
  accepted!: true;

  /** Version of the text the user agreed to, so a later change of the text can be told apart. */
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
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  lastName!: string;

  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsStrongPassword(PASSWORD_POLICY)
  password!: string;

  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN, { message: '$property must be a date (YYYY-MM-DD)' })
  birthDate!: string;

  @ValidateIf(isPresent)
  @IsIn(GENDERS)
  gender?: PatientGender;

  @IsDefined()
  @ValidateNested()
  @Type(() => AccountConsentDto)
  accountConsent!: AccountConsentDto;
}
