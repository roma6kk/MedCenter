import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiProblems, GUARD_PROBLEM_STATUSES, Public, RateLimit } from '@medcenter/common';
import { ApiBearerAuth, ApiBody, ApiExtraModels, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SMART_SCOPES } from '@medcenter/contracts';
import { z } from 'zod';

import { ApiOAuthBadRequest, ApiOAuthInvalidClient } from './dto/oauth-docs';
import {
  JwksDoc,
  OAuthErrorDoc,
  RevokeRequestDoc,
  RevokeResponseDoc,
  ActivityResponseDoc,
  SmartConfigurationDoc,
  TokenResponseDoc,
} from './dto/oauth-response.doc';
import { TokenRequestDto } from './dto/token-request.dto';
import { OAuthErrorFilter } from './filters/oauth-error.filter';
import { TokenClientGuard } from './guards/token-client.guard';
import { SIGNING_KEYS, type SigningKeys } from './jwt.service';
import { JwksService, type JwksDocument } from './jwks.service';
import { OAuthError } from './oauth-error';
import { OAuthService, type TokenResponse } from './oauth.service';

interface RevokeRequestDto {
  readonly refreshToken?: string;
  readonly client_id?: string;
  readonly clientId?: string;
}

interface AuthenticatedRequest {
  readonly user?: { readonly sub?: string; readonly sid?: string };
}

function readPrincipalId(request: AuthenticatedRequest): string {
  const sub = request.user?.sub;
  if (typeof sub !== 'string' || sub.length === 0) {
    throw OAuthError.invalidClient('Authenticated principal is required');
  }
  return sub;
}

export interface SmartConfiguration {
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly revocation_endpoint: string;
  readonly jwks_uri: string;
  readonly scopes_supported: ReadonlyArray<string>;
  readonly response_types_supported: ReadonlyArray<string>;
  readonly capabilities: ReadonlyArray<string>;
  readonly code_challenge_methods_supported: ReadonlyArray<string>;
  readonly token_endpoint_auth_methods_supported: ReadonlyArray<string>;
  readonly grant_types_supported: ReadonlyArray<string>;
  readonly fhir_base: string;
}

const fhirBaseUrlSchema = z.object({ FHIR_BASE_URL: z.url() });

// A missing or malformed FHIR_BASE_URL yields '' rather than a half-parsed value.
export function readFhirBaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  const parsed = fhirBaseUrlSchema.safeParse({ FHIR_BASE_URL: source['FHIR_BASE_URL'] });
  return parsed.success ? parsed.data.FHIR_BASE_URL : '';
}

@ApiTags('auth')
@ApiExtraModels(OAuthErrorDoc)
@UseFilters(OAuthErrorFilter)
@Controller()
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly jwks: JwksService,
    @Inject(SIGNING_KEYS) private readonly keys: SigningKeys,
  ) {}

  @Public()
  @ApiOperation({ summary: '2.1.1 SMART discovery document' })
  @ApiResponse({ status: 200, description: 'Endpoints, scopes and capabilities', type: SmartConfigurationDoc })
  @ApiProblems([429, 500])
  @Get('.well-known/smart-configuration')
  smartConfiguration(): SmartConfiguration {
    const issuer = this.keys.issuer;

    return {
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/token/revoke`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      scopes_supported: Object.values(SMART_SCOPES),
      response_types_supported: ['code'],
      capabilities: ['launch-standalone', 'client-public', 'context-passthrough'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      fhir_base: readFhirBaseUrl(),
    };
  }

  @Public()
  @ApiOperation({ summary: '2.1.5 Public RS256 key set (JWKS)' })
  @ApiResponse({ status: 200, description: 'JSON Web Key Set used to verify access tokens', type: JwksDoc })
  @ApiProblems([429, 500])
  @Get('.well-known/jwks.json')
  jwksDocument(): JwksDocument {
    return this.jwks.getPublicJwks();
  }

  @HttpCode(HttpStatus.OK)
  // RFC 6749 §5.1: a successful token response must not be cached (the error filter sets the same header).
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Public()
  // Per credential plus a generous per-address ceiling, so clients behind one NAT or BFF do not share a bucket.
  @RateLimit(20, { perAddressCeiling: 600 })
  @ApiOperation({ summary: '2.1.3 Exchange an authorization code or refresh token for tokens' })
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiBody({ type: TokenRequestDto })
  @ApiResponse({ status: 200, description: 'Access and refresh tokens (Cache-Control: no-store)', type: TokenResponseDoc })
  @ApiOAuthBadRequest('RFC 6749 error envelope: invalid_request, invalid_grant (also a revoked or rotated refresh token), unsupported_grant_type')
  @ApiOAuthInvalidClient('invalid_client: unknown client_id or failed client authentication')
  @ApiProblems([429, 500])
  @UseGuards(TokenClientGuard)
  @Post('oauth/token')
  async token(@Body() body: TokenRequestDto): Promise<TokenResponse> {
    if (body.grant_type === 'authorization_code') {
      if (!body.code || !body.client_id || !body.code_verifier) {
        throw OAuthError.invalidRequest('code, client_id and code_verifier are required');
      }
      return this.oauth.exchangeCode({
        code: body.code,
        clientId: body.client_id,
        codeVerifier: body.code_verifier,
      });
    }
    if (body.grant_type === 'refresh_token') {
      if (!body.refresh_token || !body.client_id) {
        throw OAuthError.invalidRequest('refresh_token and client_id are required');
      }
      return this.oauth.refresh({ refreshToken: body.refresh_token, clientId: body.client_id });
    }
    throw OAuthError.unsupportedGrantType(String(body.grant_type));
  }

  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '2.1.4 Revoke a refresh token' })
  @ApiBearerAuth()
  @ApiBody({ type: RevokeRequestDoc })
  @ApiResponse({ status: 200, description: 'Outcome of the revocation (false when the token is not the caller\'s or already unusable)', type: RevokeResponseDoc })
  @ApiOAuthBadRequest('invalid_request: refreshToken is required')
  @ApiProblems(GUARD_PROBLEM_STATUSES)
  @Post('oauth/token/revoke')
  async revoke(
    @Body() body: RevokeRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ readonly revoked: boolean }> {
    if (typeof body.refreshToken !== 'string' || body.refreshToken.length === 0) {
      throw OAuthError.invalidRequest('refreshToken is required');
    }
    const clientId = body.client_id ?? body.clientId;
    const revoked = await this.oauth.revoke({
      refreshToken: body.refreshToken,
      userId: readPrincipalId(request),
      ...(typeof clientId === 'string' && clientId.length > 0 ? { clientId } : {}),
    });
    return { revoked };
  }

  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '2.1.6 Record user activity for the idle session timeout' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'false when the session is unknown or already idle for longer than the limit', type: ActivityResponseDoc })
  @ApiProblems(GUARD_PROBLEM_STATUSES)
  @Post('oauth/token/activity')
  async activity(@Req() request: AuthenticatedRequest): Promise<{ readonly recorded: boolean }> {
    const sessionId = request.user?.sid;
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      return { recorded: false };
    }
    return { recorded: await this.oauth.recordActivity(sessionId, readPrincipalId(request)) };
  }
}
