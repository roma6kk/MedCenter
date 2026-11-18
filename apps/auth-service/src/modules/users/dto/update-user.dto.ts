import { Role } from '@medcenter/contracts';
import { FHIR_ID_PATTERN } from '@medcenter/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsStrongPassword,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { PASSWORD_POLICY } from '../../../config/auth-env';
import type { PatientGender } from '../patient-provisioner';
import {
  DATE_ONLY_PATTERN,
  EMAIL_MAX_LENGTH,
  GENDERS,
  IsPlausibleBirthDate,
  NO_CONTROL_CHARS,
  NO_CONTROL_CHARS_MESSAGE,
  trimmed,
  NAME_MAX_LENGTH,
  isPresent,
  PASSWORD_MAX_LENGTH,
} from './validation-patterns';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'ivanov@example.by', maxLength: EMAIL_MAX_LENGTH })
  @ValidateIf(isPresent)
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  @ApiPropertyOptional({ example: 'Иван', maxLength: NAME_MAX_LENGTH })
  @ValidateIf(isPresent)
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  @Matches(NO_CONTROL_CHARS, { message: NO_CONTROL_CHARS_MESSAGE })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Иванов', maxLength: NAME_MAX_LENGTH })
  @ValidateIf(isPresent)
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  @Matches(NO_CONTROL_CHARS, { message: NO_CONTROL_CHARS_MESSAGE })
  lastName?: string;

  @ApiPropertyOptional({ type: String, format: 'date', example: '1990-05-12' })
  @ValidateIf(isPresent)
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN, { message: '$property must be a date (YYYY-MM-DD)' })
  @IsPlausibleBirthDate()
  birthDate?: string;

  @ApiPropertyOptional({ enum: [...GENDERS], enumName: 'PatientGender' })
  @ValidateIf(isPresent)
  @IsIn(GENDERS)
  gender?: PatientGender;

  @ApiPropertyOptional({ enum: Role, enumName: 'Role', isArray: true, minItems: 1, uniqueItems: true, description: 'Replaces the whole role set' })
  @ValidateIf(isPresent)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  roles?: Role[];

  @ApiPropertyOptional({ type: Boolean, description: 'false deactivates the account' })
  @ValidateIf(isPresent)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'pr-1', description: 'A FHIR id links the PractitionerRole; null releases the link' })
  @IsOptional()
  @Matches(FHIR_ID_PATTERN, { message: '$property must be a FHIR resource id' })
  practitionerRoleId?: string | null;

  @ApiPropertyOptional({ format: 'password', maxLength: PASSWORD_MAX_LENGTH, description: 'Sets a new password and closes the user\'s sessions; must satisfy the password policy' })
  @ValidateIf(isPresent)
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsStrongPassword(PASSWORD_POLICY)
  password?: string;
}
