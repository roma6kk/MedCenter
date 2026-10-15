import { IsOptional, IsString, MaxLength } from 'class-validator';

import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '../../users/dto/validation-patterns';

/**
 * `application/x-www-form-urlencoded` body of `POST /oauth/login`. Every field
 * is optional at the DTO level on purpose: a browser form with a missing or
 * empty field must get the login page back with a message, not a JSON problem
 * document. The bounds still stop oversized input at the pipe.
 */
export class LoginFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  csrf?: string;

  /** The sanitised authorization request the form was rendered for. */
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  authorize_query?: string;
}
