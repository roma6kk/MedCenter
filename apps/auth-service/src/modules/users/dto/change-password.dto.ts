import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsStrongPassword, MaxLength } from 'class-validator';

import { PASSWORD_POLICY } from '../../../config/auth-env';
import { PASSWORD_MAX_LENGTH } from './validation-patterns';

export class ChangePasswordDto {
  @ApiProperty({ format: 'password', description: 'The current password of the account' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @ApiProperty({ format: 'password', example: 'N3w!Password', maxLength: PASSWORD_MAX_LENGTH, description: 'Must satisfy the password policy' })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsStrongPassword(PASSWORD_POLICY)
  newPassword!: string;
}
