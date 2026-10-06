import {
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { parseJwtEnv } from '@medcenter/config';
import type { JWTPayload, RemoteJWKSet } from 'jose';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtClaims, RequestWithClaims } from '../request-context';
import { TOKEN_REVOCATION, revocationKeysOf, type TokenRevocationChecker } from './token-revocation';

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

type AuthenticatedRequest = RequestWithClaims & {
  readonly headers: { readonly authorization?: string };
};

function extractBearerToken(authorization: string | undefined): string | null {
  if (authorization === undefined) {
    return null;
  }
  return BEARER_PATTERN.exec(authorization)?.[1] ?? null;
}

function toJwtClaims(payload: JWTPayload): JwtClaims {
  const { sub, scope, role, jti, patient, fhirUser, sid } = payload;
  if (
    typeof sub !== 'string' ||
    typeof scope !== 'string' ||
    typeof role !== 'string' ||
    typeof jti !== 'string'
  ) {
    throw new UnauthorizedException({
      errorCode: 'UNAUTHENTICATED',
      message: 'Token claims are incomplete',
    });
  }
  return {
    sub,
    scope,
    role,
    jti,
    ...(typeof patient === 'string' ? { patient } : {}),
    ...(typeof fhirUser === 'string' ? { fhirUser } : {}),
    ...(typeof sid === 'string' ? { sid } : {}),
  };
}

let cachedJwksUri: string | null = null;
let cachedJwks: RemoteJWKSet | null = null;

/**
 * `jose` ships pure ESM; the import stays lazy so the CJS Jest runtime never
 * evaluates it (Node ≥ 22.12 loads it through `require(esm)` at request time).
 */
async function getJwks(uri: string): Promise<RemoteJWKSet> {
  if (cachedJwks !== null && cachedJwksUri === uri) {
    return cachedJwks;
  }
  const { createRemoteJWKSet } = await import('jose');
  cachedJwks = createRemoteJWKSet(new URL(uri));
  cachedJwksUri = uri;
  return cachedJwks;
}

async function verifyBearerToken(token: string): Promise<JwtClaims> {
  const env = parseJwtEnv(process.env);
  const { jwtVerify } = await import('jose');
  const { payload } = await jwtVerify(token, await getJwks(env.JWT_JWKS_URI), {
    issuer: env.JWT_ISSUER,
  });
  return toJwtClaims(payload);
}

/**
 * First guard of the shared stack (ADR-009): verifies the `Authorization`
 * bearer token against the issuer JWKS, rejects anything the issuer has revoked,
 * and attaches the claims to the request. `@Public()` routes are the only ones
 * exempted.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(TOKEN_REVOCATION)
    private readonly revocation: TokenRevocationChecker | null = null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (token === null) {
      throw new UnauthorizedException({
        errorCode: 'UNAUTHENTICATED',
        message: 'Bearer token is required',
      });
    }

    const claims = await verifyBearerToken(token);
    await this.assertNotRevoked(claims);
    request.user = claims;
    return true;
  }

  /**
   * Guard-layer revocation (API error catalogue `TOKEN_REVOKED`, 401): a token
   * whose `jti` — or whose session `sid` — is in the issuer's denylist is refused
   * even though its signature and expiry are still valid. This is what makes a
   * logout immediate rather than bound to the 15-minute access-token lifetime.
   *
   * The check **fails open**: a denylist that cannot be reached must not take
   * every BFF service down with it, so the failure is logged (`GOLDEN-PRINCIPLES`
   * — never swallow errors) and the token is accepted. Revocation is a secondary
   * control behind a short token lifetime, while an unreachable shared store is a
   * hard availability event.
   */
  private async assertNotRevoked(claims: JwtClaims): Promise<void> {
    const checker = this.revocation;
    if (checker === null) {
      return;
    }

    for (const key of revocationKeysOf(claims)) {
      let revoked: boolean;
      try {
        revoked = await checker.isRevoked(key);
      } catch (error: unknown) {
        this.logger.error({ err: error, key }, 'Revocation denylist unreachable; failing open');
        return;
      }
      if (revoked) {
        throw new UnauthorizedException({
          errorCode: 'TOKEN_REVOKED',
          message: 'Token has been revoked',
        });
      }
    }
  }
}
