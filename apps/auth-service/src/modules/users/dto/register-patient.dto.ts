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
  IsPlausibleBirthDate,
  NO_CONTROL_CHARS,
  NO_CONTROL_CHARS_MESSAGE,
  trimmed,
  isPresent,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
} from './validation-patterns';

class AccountConsentDto {
  @ApiProperty({ type: Boolean, enum: [true], example: true, description: 'Only true is accepted' })
  @Equals(true, { message: 'accepted must be true' })
  accepted!: true;

  @ApiProperty({ example: '2026-11', maxLength: ACCOUNT_CONSENT_VERSION_MAX_LENGTH, description: 'Version of the consent text shown to the user' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ACCOUNT_CONSENT_VERSION_MAX_LENGTH)
  @Matches(NO_CONTROL_CHARS, { message: NO_CONTROL_CHARS_MESSAGE })
  textVersion!: string;
}

export class RegisterPatientDto {
  @ApiProperty({ example: 'ivanov@example.by', maxLength: EMAIL_MAX_LENGTH })
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @ApiProperty({ example: 'Иван', maxLength: NAME_MAX_LENGTH })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  @Matches(NO_CONTROL_CHARS, { message: NO_CONTROL_CHARS_MESSAGE })
  firstName!: string;

  @ApiProperty({ example: 'Иванов', maxLength: NAME_MAX_LENGTH })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  @Matches(NO_CONTROL_CHARS, { message: NO_CONTROL_CHARS_MESSAGE })
  lastName!: string;

  @ApiProperty({ format: 'password', example: 'Str0ng!Pass', maxLength: PASSWORD_MAX_LENGTH, description: 'Must satisfy the password policy' })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsStrongPassword(PASSWORD_POLICY)
  password!: string;

  @ApiProperty({ type: String, format: 'date', example: '1990-05-12' })
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN, { message: '$property must be a date (YYYY-MM-DD)' })
  @IsPlausibleBirthDate()
  birthDate!: string;

  @ApiPropertyOptional({ enum: [...GENDERS], enumName: 'PatientGender' })
  @ValidateIf(isPresent)
  @IsIn(GENDERS)
  gender?: PatientGender;

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
