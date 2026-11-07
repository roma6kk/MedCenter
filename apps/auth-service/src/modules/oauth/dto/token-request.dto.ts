import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// Type guards only: errors of this endpoint must be RFC 6749 §5.2 OAuth errors raised by the controller, not ValidationPipe problem documents (grant_type is free, empty = absent, TokenClientGuard reads the body before pipes).
export class TokenRequestDto {
  @ApiPropertyOptional({ enum: ['authorization_code', 'refresh_token'], description: 'Grant type; any other value answers unsupported_grant_type' })
  @IsOptional()
  @IsString()
  grant_type?: string;

  @ApiPropertyOptional({ description: 'Authorization code (authorization_code grant)' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ format: 'uri', description: 'The redirect_uri of the authorization request' })
  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @ApiPropertyOptional({ example: 'medcenter-web', description: 'Required by both grants' })
  @IsOptional()
  @IsString()
  client_id?: string;

  @ApiPropertyOptional({ format: 'password', description: 'Secret of a confidential client (client_secret_post)' })
  @IsOptional()
  @IsString()
  client_secret?: string;

  @ApiPropertyOptional({ description: 'PKCE code verifier (authorization_code grant)' })
  @IsOptional()
  @IsString()
  code_verifier?: string;

  @ApiPropertyOptional({ description: 'Refresh token to rotate (refresh_token grant)' })
  @IsOptional()
  @IsString()
  refresh_token?: string;
}
