import { Role } from '@medcenter/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  FHIR_ID_PATTERN,
  GENDERS,
  isPresent,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
} from './validation-patterns';

/**
 * API §2.2.1 `POST /api/v1/admin/users`. A `PATIENT` account gets its FHIR
 * `Patient` exactly like a self-registration, so `birthDate` is required for
 * it (checked by the service, which knows the final role set). A `DOCTOR`
 * account may be linked to an existing `PractitionerRole` right away.
 */
export class CreateUserDto {
  @ApiProperty({ example: 'ivanov@example.by', maxLength: EMAIL_MAX_LENGTH, description: 'Login; unique case-insensitively (409 EMAIL_TAKEN)' })
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
  birthDate?: string;

  @ApiPropertyOptional({ enum: [...GENDERS], enumName: 'PatientGender' })
  @ValidateIf(isPresent)
  @IsIn(GENDERS)
  gender?: PatientGender;

  /** Bare `PractitionerRole.id`; only valid together with the `DOCTOR` role. */
  @ApiPropertyOptional({ example: 'pr-1', description: 'Bare PractitionerRole.id; only valid together with the DOCTOR role' })
  @ValidateIf(isPresent)
  @Matches(FHIR_ID_PATTERN, { message: '$property must be a FHIR resource id' })
  practitionerRoleId?: string;
}
