import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '../../users/dto/validation-patterns';

/**
 * `application/x-www-form-urlencoded` body of `POST /oauth/login`. Every field
 * is optional at the DTO level on purpose: a browser form with a missing or
 * empty field must get the login page back with a message, not a JSON problem
 * document. The bounds still stop oversized input at the pipe.
 */
export class LoginFormDto {
  @ApiPropertyOptional({ example: 'ivanov@example.by', maxLength: EMAIL_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  @ApiPropertyOptional({ format: 'password', maxLength: PASSWORD_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;

  @ApiPropertyOptional({ maxLength: 128, description: 'CSRF token of the rendered form (also in a cookie)' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  csrf?: string;

  /** The sanitised authorization request the form was rendered for. */
  @ApiPropertyOptional({ maxLength: 8192, description: 'The sanitised authorization query string the form was rendered for' })
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  authorize_query?: string;
}
