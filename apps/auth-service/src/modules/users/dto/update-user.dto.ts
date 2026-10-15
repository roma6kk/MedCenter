import { Role } from '@medcenter/contracts';
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
  @ValidateIf(isPresent)
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  @ValidateIf(isPresent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  firstName?: string;

  @ValidateIf(isPresent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  lastName?: string;

  @ValidateIf(isPresent)
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN, { message: '$property must be a date (YYYY-MM-DD)' })
  birthDate?: string;

  @ValidateIf(isPresent)
  @IsIn(GENDERS)
  gender?: PatientGender;

  /** Replaces the whole role set. */
  @ValidateIf(isPresent)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  roles?: Role[];

  @ValidateIf(isPresent)
  @IsBoolean()
  isActive?: boolean;

  /** A FHIR id links the account's `PractitionerRole`; `null` releases the link. */
  @IsOptional()
  @Matches(FHIR_ID_PATTERN, { message: '$property must be a FHIR resource id' })
  practitionerRoleId?: string | null;
}
