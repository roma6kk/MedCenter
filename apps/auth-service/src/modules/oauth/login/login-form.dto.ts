import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '../../users/dto/validation-patterns';

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

  @ApiPropertyOptional({ maxLength: 8192, description: 'The sanitised authorization query string the form was rendered for' })
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  authorize_query?: string;
}
