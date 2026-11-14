import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const DEACTIVATE_PASSWORD_MAX_LENGTH = 128;

export class DeactivateAccountDto {
  @ApiProperty({ format: 'password', description: 'The current password of the account' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(DEACTIVATE_PASSWORD_MAX_LENGTH)
  password!: string;
}
