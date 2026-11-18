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
import { createDefaultRevocationChecker } from './redis-token-revocation';
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

/** `jose` is pure ESM; the lazy import keeps the CJS Jest runtime from evaluating it. */
async function getJwks(uri: string): Promise<RemoteJWKSet> {
  if (cachedJwks !== null && cachedJwksUri === uri) {
    return cachedJwks;
  }
  const { createRemoteJWKSet } = await import('jose');
  cachedJwks = createRemoteJWKSet(new URL(uri));
  cachedJwksUri = uri;
  return cachedJwks;
}

/** `jose` codes of an unacceptable token (401, the client may refresh). An unreachable JWKS is ours and deliberately not listed. */
const REJECTED_TOKEN_CODES: ReadonlySet<string> = new Set([
  'ERR_JWT_EXPIRED',
  'ERR_JWT_INVALID',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWS_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JOSE_NOT_SUPPORTED',
]);

function rejectionCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  const { code } = error as { code: unknown };
  return typeof code === 'string' && REJECTED_TOKEN_CODES.has(code) ? code : null;
}

async function verifyBearerToken(token: string): Promise<JwtClaims> {
  const env = parseJwtEnv(process.env);
  const { jwtVerify } = await import('jose');
  const { payload } = await jwtVerify(token, await getJwks(env.JWT_JWKS_URI), {
    issuer: env.JWT_ISSUER,
  });
  return toJwtClaims(payload);
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  private readonly revocation: TokenRevocationChecker | null;

  constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(TOKEN_REVOCATION)
    revocation: TokenRevocationChecker | null = null,
  ) {
    this.revocation = revocation ?? createDefaultRevocationChecker();
  }

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

    const claims = await this.verify(token);
    await this.assertNotRevoked(claims);
    request.user = claims;
    return true;
  }

  /** A token `jose` rejects is `401 UNAUTHENTICATED`; the reason (which could help a forger) stays in the debug log. */
  private async verify(token: string): Promise<JwtClaims> {
    try {
      return await verifyBearerToken(token);
    } catch (error: unknown) {
      const code = rejectionCodeOf(error);
      if (code === null) {
        throw error;
      }
      this.logger.debug({ code }, 'Bearer token rejected');
      throw new UnauthorizedException({ errorCode: 'UNAUTHENTICATED', message: 'Bearer token is invalid or expired' });
    }
  }

  /** Revocation fails open: an unreachable denylist is logged and must not take every BFF down; it backs a short token lifetime. */
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
