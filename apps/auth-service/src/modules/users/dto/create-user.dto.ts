import { Role } from '@medcenter/contracts';
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

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  roles!: Role[];

  @ValidateIf(isPresent)
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN, { message: '$property must be a date (YYYY-MM-DD)' })
  birthDate?: string;

  @ValidateIf(isPresent)
  @IsIn(GENDERS)
  gender?: PatientGender;

  /** Bare `PractitionerRole.id`; only valid together with the `DOCTOR` role. */
  @ValidateIf(isPresent)
  @Matches(FHIR_ID_PATTERN, { message: '$property must be a FHIR resource id' })
  practitionerRoleId?: string;
}
