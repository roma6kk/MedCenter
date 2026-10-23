import { Role } from '@medcenter/contracts';
import { ApiPropertyOptional } from '@nestjs/swagger';
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
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import type { PatientGender } from '../patient-provisioner';
import {
  DATE_ONLY_PATTERN,
  EMAIL_MAX_LENGTH,
  FHIR_ID_PATTERN,
  GENDERS,
  NAME_MAX_LENGTH,
  isPresent,
} from './validation-patterns';

/**
 * API §2.2.4 `PATCH /api/v1/admin/users/{id}`:
 * `PartialType(OmitType(RegisterPatientDto, ['password']))` + `roles` + `isActive`,
 * spelled out because `@nestjs/mapped-types` is not a dependency of the
 * workspace. `practitionerRoleId` links a `DOCTOR` account (task brief).
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'ivanov@example.by', maxLength: EMAIL_MAX_LENGTH })
  @ValidateIf(isPresent)
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  @ApiPropertyOptional({ example: 'Иван', maxLength: NAME_MAX_LENGTH })
  @ValidateIf(isPresent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Иванов', maxLength: NAME_MAX_LENGTH })
  @ValidateIf(isPresent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  lastName?: string;

  @ApiPropertyOptional({ type: String, format: 'date', example: '1990-05-12' })
  @ValidateIf(isPresent)
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN, { message: '$property must be a date (YYYY-MM-DD)' })
  birthDate?: string;

  @ApiPropertyOptional({ enum: [...GENDERS], enumName: 'PatientGender' })
  @ValidateIf(isPresent)
  @IsIn(GENDERS)
  gender?: PatientGender;

  /** Replaces the whole role set. */
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

  /** A FHIR id links the account's `PractitionerRole`; `null` releases the link. */
  @ApiPropertyOptional({ type: String, nullable: true, example: 'pr-1', description: 'A FHIR id links the PractitionerRole; null releases the link' })
  @IsOptional()
  @Matches(FHIR_ID_PATTERN, { message: '$property must be a FHIR resource id' })
  practitionerRoleId?: string | null;
}
