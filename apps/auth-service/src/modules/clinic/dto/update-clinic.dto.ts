import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

import {
  EMAIL_MAX_LENGTH,
  NO_CONTROL_CHARS,
  NO_CONTROL_CHARS_MESSAGE,
  isPresent,
  trimmed,
} from '../../users/dto/validation-patterns';

export const CLINIC_NAME_MAX_LENGTH = 200;
export const CLINIC_PHONE_MAX_LENGTH = 30;
export const CLINIC_ADDRESS_MAX_LENGTH = 300;
export const CLINIC_HOURS_MAX_LENGTH = 200;

const PHONE_WITH_SEPARATORS = /^\+375[\s\-()]*(\d[\s\-()]*){9}$/;

export class UpdateClinicDto {
  @ApiPropertyOptional({ example: 'ООО «Лайфлайн»', maxLength: CLINIC_NAME_MAX_LENGTH })
  @ValidateIf(isPresent)
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CLINIC_NAME_MAX_LENGTH)
  @Matches(NO_CONTROL_CHARS, { message: NO_CONTROL_CHARS_MESSAGE })
  name?: string;

  @ApiPropertyOptional({ example: '+375 17 000-00-00', description: 'Belarus number: +375 and nine digits; spaces and dashes are allowed' })
  @ValidateIf(isPresent)
  @Transform(trimmed)
  @IsString()
  @MaxLength(CLINIC_PHONE_MAX_LENGTH)
  @Matches(PHONE_WITH_SEPARATORS, { message: 'phone must be a Belarus number: +375 and nine digits' })
  phone?: string;

  @ApiPropertyOptional({ example: 'info@lifeline.example', maxLength: EMAIL_MAX_LENGTH })
  @ValidateIf(isPresent)
  @Transform(trimmed)
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  @ApiPropertyOptional({ example: 'г. Минск, ул. Здоровья, 12', maxLength: CLINIC_ADDRESS_MAX_LENGTH })
  @ValidateIf(isPresent)
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CLINIC_ADDRESS_MAX_LENGTH)
  @Matches(NO_CONTROL_CHARS, { message: NO_CONTROL_CHARS_MESSAGE })
  address?: string;

  @ApiPropertyOptional({ example: 'Пн–Пт 08:00–20:00, сб 09:00–15:00', maxLength: CLINIC_HOURS_MAX_LENGTH })
  @ValidateIf(isPresent)
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CLINIC_HOURS_MAX_LENGTH)
  @Matches(NO_CONTROL_CHARS, { message: NO_CONTROL_CHARS_MESSAGE })
  hours?: string;
}
