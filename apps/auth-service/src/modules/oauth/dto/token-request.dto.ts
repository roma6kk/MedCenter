import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * `application/x-www-form-urlencoded` body of `POST /oauth/token` (API 2.1.3).
 *
 * The decorators here are deliberately *type* guards only. RFC 6749 §5.2 owns the
 * error envelopes of this endpoint (`invalid_request`, `unsupported_grant_type`),
 * and the global `ValidationPipe` (`libs/common`, mounted in `main.ts`) answers
 * with the RFC 7807 problem document instead — so anything that must produce an
 * OAuth error stays a controller concern:
 *
 * - `grant_type` is a free string, not an `@IsIn` whitelist, or an unsupported
 *   grant would be answered as a validation failure rather than
 *   `unsupported_grant_type`.
 * - the per-grant fields have no `@MinLength(1)`: an empty form value simply means
 *   "absent" (`code_verifier=`), which the controller reports as `invalid_request`.
 * - `client_secret` is declared (R4) so the type documents the confidential
 *   client's credential. It stays `@IsOptional() @IsString()` — a type guard
 *   only — because `TokenClientGuard` reads the raw body *before* pipes run,
 *   and rejecting unknown shapes here would break the client authentication
 *   the discovery document advertises (`client_secret_post`).
 */
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
