import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public, RateLimit } from '@medcenter/common';
import { SMART_SCOPES } from '@medcenter/contracts';
import { z } from 'zod';

import { TokenRequestDto } from './dto/token-request.dto';
import { OAuthErrorFilter } from './filters/oauth-error.filter';
import { AuthorizePageGuard } from './guards/authorize-page.guard';
import { ClientGuard, readQueryString, type RegisteredClient } from './guards/client.guard';
import { TokenClientGuard } from './guards/token-client.guard';
import { SIGNING_KEYS, type SigningKeys } from './jwt.service';
import { JwksService, type JwksDocument } from './jwks.service';
import { OAuthError } from './oauth-error';
import { OAuthService, type TokenResponse } from './oauth.service';

interface AuthorizePrincipal {
  readonly sub: string;
  readonly role: string;
  readonly patient?: string;
  readonly fhirUser?: string;
}

interface AuthorizeRequest {
  readonly query: Record<string, unknown>;
  readonly client?: RegisteredClient;
  readonly user?: AuthorizePrincipal;
}

interface RevokeRequestDto {
  readonly refreshToken?: string;
  readonly client_id?: string;
  readonly clientId?: string;
}

/** The authenticated caller of a protected route: Bearer claims attached by `JwtAuthGuard`. */
interface AuthenticatedRequest {
  readonly user?: { readonly sub?: string };
}

function readPrincipalId(request: AuthenticatedRequest): string {
  const sub = request.user?.sub;
  if (typeof sub !== 'string' || sub.length === 0) {
    // The global guard already rejected unauthenticated calls; this is defensive.
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

/**
 * N5: `fhir_base` is validated, not just read. A bare
 * `process.env['FHIR_BASE_URL'] ?? ''` silently advertised an empty string
 * when the variable was missing or malformed; the narrow `zod` parse below
 * returns `''` only when the value is absent or not a URL — never a
 * half-configured string — while staying independent of the full env schema
 * (which requires secrets this surface's unit tests never set).
 */
const fhirBaseUrlSchema = z.object({ FHIR_BASE_URL: z.url() });

export function readFhirBaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  const parsed = fhirBaseUrlSchema.safeParse({ FHIR_BASE_URL: source['FHIR_BASE_URL'] });
  return parsed.success ? parsed.data.FHIR_BASE_URL : '';
}

/**
 * The `error` values RFC 6749 §4.1.2.1 allows on the authorize redirect.
 * `invalid_client`, `invalid_grant` and `unsupported_grant_type` belong to the
 * token endpoint (§5.2) and are reported as `access_denied` instead.
 */
type AuthorizeRedirectError = 'access_denied' | 'invalid_request' | 'invalid_scope';

/** M5: forwards the RFC code a SMART client branches on, e.g. `invalid_scope`. */
function toAuthorizeRedirectError(error: OAuthError): AuthorizeRedirectError {
  const body = error.getResponse();
  const code =
    typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined;
  return code === 'invalid_request' || code === 'invalid_scope' ? code : 'access_denied';
}

function errorRedirect(
  redirectUri: string,
  state: string,
  error: AuthorizeRedirectError = 'access_denied',
): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (state.length > 0) {
    url.searchParams.set('state', state);
  }
  return url.toString();
}

/**
 * SMART / OAuth2 surface of `auth-service` (API 2.1.1–2.1.5).
 *
 * Two contracts apply here and they are not the same one:
 *
 * - The **redirect** back to the client is the only response shape that must
 *   never leak client or code material, so a failure of this surface's domain on
 *   `authorize` bounces to the *registered* `redirect_uri` with its RFC 6749
 *   §4.1.2.1 `error` (`invalid_request`, `invalid_scope`, otherwise
 *   `access_denied`). An infrastructure failure is not a consent decision
 *   and must not be reported as one.
 * - Errors raised before that point must be legible to a SMART client, so they
 *   leave as the RFC 6749 §5.2 envelope via `OAuthErrorFilter` — *not* as the
 *   RFC 7807 problem document the rest of the API uses. Only `OAuthError`
 *   instances are claimed by that filter; anything else still reaches the global
 *   `ProblemDetailsFilter`.
 */
@UseFilters(OAuthErrorFilter)
@Controller()
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauth: OAuthService,
    private readonly jwks: JwksService,
    @Inject(SIGNING_KEYS) private readonly keys: SigningKeys,
  ) {}

  @Public()
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
      // SMART App Launch: a PKCE-only public client authenticates with `none`,
      // and the confidential client posts its secret in the token request body —
      // exactly what `TokenClientGuard` accepts (API 2.1.3).
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      fhir_base: readFhirBaseUrl(),
    };
  }

  @Public()
  @Get('.well-known/jwks.json')
  jwksDocument(): JwksDocument {
    return this.jwks.getPublicJwks();
  }

  @Public()
  @UseGuards(ClientGuard, AuthorizePageGuard)
  @Get('oauth/authorize')
  async authorize(@Req() request: AuthorizeRequest, @Res() response: Response): Promise<void> {
    const client = request.client;
    const requestedRedirect = readQueryString(request.query, 'redirect_uri');
    const redirectUri =
      client === undefined ? requestedRedirect : requestedRedirect || client.redirectUris[0] || '';
    const state = readQueryString(request.query, 'state');
    const principal = request.user;

    if (client === undefined || redirectUri.length === 0) {
      throw OAuthError.invalidRequest('client_id and a registered redirect_uri are required');
    }
    if (principal === undefined) {
      // Assumption UI-1: the credential form lives here; until a session exists
      // the browser is returned to the client with `access_denied`.
      response.redirect(errorRedirect(redirectUri, state));
      return;
    }

    try {
      const redirectUrl = await this.oauth.authorize({
        client,
        redirectUri,
        scope: readQueryString(request.query, 'scope'),
        state,
        codeChallenge: readQueryString(request.query, 'code_challenge'),
        principal: {
          userId: principal.sub,
          role: principal.role,
          ...(principal.patient !== undefined ? { patientRef: principal.patient } : {}),
          ...(principal.fhirUser !== undefined ? { fhirUser: principal.fhirUser } : {}),
        },
      });
      response.redirect(redirectUrl);
    } catch (error: unknown) {
      // Only a domain failure of this surface is bounced to the client: an
      // unreachable store or denylist, a rejected signing key or a broken
      // registry is an outage, and answering it as a denial would hide it from
      // the user *and* from monitoring. Anything that is not an `OAuthError`
      // propagates to `ProblemDetailsFilter`, which logs it with the request id.
      if (!(error instanceof OAuthError)) {
        throw error;
      }
      this.logger.warn(
        { err: error, clientId: client.clientId },
        'Authorization request denied; bouncing to the registered redirect_uri',
      );
      response.redirect(errorRedirect(redirectUri, state, toAuthorizeRedirectError(error)));
    }
  }

  // RFC 6749 §5.1 mandates 200 OK for a successful token response; Nest would
  // otherwise answer 201 for a POST.
  @HttpCode(HttpStatus.OK)
  // RFC 6749 §5.1: a successful token response MUST NOT be cached. The error
  // path sets the same header in `OAuthErrorFilter`; declaring it here closes
  // M8 so both branches carry it.
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Public()
  @RateLimit(20)
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

  // API 2.1.4 documents 200 for the revocation outcome body.
  @HttpCode(HttpStatus.OK)
  @Post('oauth/token/revoke')
  async revoke(
    @Body() body: RevokeRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ readonly revoked: boolean }> {
    if (typeof body.refreshToken !== 'string' || body.refreshToken.length === 0) {
      throw OAuthError.invalidRequest('refreshToken is required');
    }
    // RFC 7009 §2.1: only the principal the token was issued to may revoke it.
    // `client_id` is optional (a user-driven logout has no client identity); the
    // service still requires the token to belong to the authenticated user.
    const clientId = body.client_id ?? body.clientId;
    const revoked = await this.oauth.revoke({
      refreshToken: body.refreshToken,
      userId: readPrincipalId(request),
      ...(typeof clientId === 'string' && clientId.length > 0 ? { clientId } : {}),
    });
    return { revoked };
  }
}
