import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { parseJwtEnv } from '@medcenter/config';
import type { JWTPayload, RemoteJWKSet } from 'jose';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtClaims, RequestWithClaims } from '../request-context';

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
  const { sub, scope, role, jti, patient, fhirUser } = payload;
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
 * bearer token against the issuer JWKS and attaches the claims to the request.
 * `@Public()` routes are the only ones exempted.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

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

    request.user = await verifyBearerToken(token);
    return true;
  }
}
