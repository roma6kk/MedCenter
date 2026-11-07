import { Role } from '@medcenter/contracts';
import { FHIR_ID_PATTERN } from '@medcenter/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
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
  isPresent,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
} from './validation-patterns';

export class CreateUserDto {
  @ApiProperty({ example: 'ivanov@example.by', maxLength: EMAIL_MAX_LENGTH, description: 'Login; unique case-insensitively (409 EMAIL_TAKEN)' })
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

  @ApiProperty({ enum: Role, enumName: 'Role', isArray: true, minItems: 1, uniqueItems: true, description: 'Role set of the account' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  roles!: Role[];

  @ApiPropertyOptional({ type: String, format: 'date', example: '1990-05-12', description: 'Required for a PATIENT account' })
  @ValidateIf(isPresent)
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN, { message: '$property must be a date (YYYY-MM-DD)' })
  @IsPlausibleBirthDate()
  birthDate?: string;

  @ApiPropertyOptional({ enum: [...GENDERS], enumName: 'PatientGender' })
  @ValidateIf(isPresent)
  @IsIn(GENDERS)
  gender?: PatientGender;

  @ApiPropertyOptional({ example: 'pr-1', description: 'Bare PractitionerRole.id; only valid together with the DOCTOR role' })
  @ValidateIf(isPresent)
  @Matches(FHIR_ID_PATTERN, { message: '$property must be a FHIR resource id' })
  practitionerRoleId?: string;
}
