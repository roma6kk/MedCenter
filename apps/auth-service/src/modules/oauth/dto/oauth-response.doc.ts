import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { OAuthErrorBody, OAuthErrorCode } from '../oauth-error';
import type { TokenResponse } from '../oauth.service';
import type { SmartConfiguration } from '../oauth.controller';

/** Successful token response (RFC 6749 §5.1, API 2.1.3). */
export class TokenResponseDoc implements TokenResponse {
  @ApiProperty({ description: 'RS256 JWT, TTL 15 min' })
  access_token!: string;

  @ApiProperty({ enum: ['Bearer'] })
  token_type!: 'Bearer';

  @ApiProperty({ example: 900, description: 'Seconds until the access token expires' })
  expires_in!: number;

  @ApiProperty({ description: 'Rotated on every refresh, TTL 14 d' })
  refresh_token!: string;

  @ApiProperty({ example: 'patient/*.read patient/*.write launch', description: 'Space-separated granted scopes' })
  scope!: string;

  @ApiPropertyOptional({ example: '9f2c', description: 'SMART launch context: the bare Patient id (PATIENT tokens only)' })
  patient?: string;
}

/** RFC 6749 §5.2 error envelope of the OAuth surface (not RFC 7807). */
export class OAuthErrorDoc implements OAuthErrorBody {
  @ApiProperty({ enum: ['invalid_request', 'invalid_client', 'invalid_grant', 'invalid_scope', 'unsupported_grant_type'] })
  error!: OAuthErrorCode;

  @ApiPropertyOptional()
  error_description?: string;

  @ApiPropertyOptional({ example: 'VALIDATION_ERROR', description: 'Catalogue code carried alongside the RFC fields' })
  errorCode?: OAuthErrorBody['errorCode'];
}

/** Body of `POST /oauth/token/revoke` (API 2.1.4). */
export class RevokeRequestDoc {
  @ApiProperty({ description: 'The refresh token to revoke' })
  refreshToken!: string;

  @ApiPropertyOptional({ example: 'medcenter-web', description: 'Owning client; a user-driven logout has none' })
  client_id?: string;
}

export class RevokeResponseDoc {
  @ApiProperty({ description: 'false when the token was not owned by the caller or was already unusable' })
  revoked!: boolean;
}

/** SMART discovery document (API 2.1.1). */
export class SmartConfigurationDoc implements SmartConfiguration {
  @ApiProperty({ format: 'uri' })
  authorization_endpoint!: string;

  @ApiProperty({ format: 'uri' })
  token_endpoint!: string;

  @ApiProperty({ format: 'uri' })
  revocation_endpoint!: string;

  @ApiProperty({ format: 'uri' })
  jwks_uri!: string;

  @ApiProperty({ type: String, isArray: true })
  scopes_supported!: string[];

  @ApiProperty({ type: String, isArray: true, example: ['code'] })
  response_types_supported!: string[];

  @ApiProperty({ type: String, isArray: true, example: ['launch-standalone', 'client-public', 'context-passthrough'] })
  capabilities!: string[];

  @ApiProperty({ type: String, isArray: true, example: ['S256'] })
  code_challenge_methods_supported!: string[];

  @ApiProperty({ type: String, isArray: true, example: ['client_secret_post', 'none'] })
  token_endpoint_auth_methods_supported!: string[];

  @ApiProperty({ type: String, isArray: true, example: ['authorization_code', 'refresh_token'] })
  grant_types_supported!: string[];

  @ApiProperty({ description: 'FHIR server base URL (HAPI); empty when not configured' })
  fhir_base!: string;
}

/** One RS256 public key as a JWK. */
export class JsonWebKeyDoc {
  @ApiProperty({ example: 'RSA' })
  kty!: string;

  @ApiProperty({ example: 'auth-1' })
  kid!: string;

  @ApiProperty({ example: 'RS256' })
  alg!: string;

  @ApiProperty({ example: 'sig' })
  use!: string;

  @ApiProperty({ description: 'Modulus, base64url' })
  n!: string;

  @ApiProperty({ example: 'AQAB', description: 'Exponent, base64url' })
  e!: string;
}

/** JWKS document (API 2.1.5). */
export class JwksDoc {
  @ApiProperty({ type: [JsonWebKeyDoc] })
  keys!: JsonWebKeyDoc[];
}

/** Liveness answer of `GET /` and `GET /health`. */
export class ServiceStatusDoc {
  @ApiProperty({ example: 'auth-service' })
  service!: string;

  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
}
