import { createHash } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { rateLimitEnvSchema } from '@medcenter/config';
import type { Response } from 'express';
import { RATE_LIMIT_CREDENTIAL_KEY, RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';
import type { RequestWithClaims } from '../request-context';

const WINDOW_SECONDS = 60;
const DEFAULT_LIMIT_PER_MINUTE = 120;

export interface RateLimitStore {
  increment(key: string, windowSeconds: number): Promise<number>;
}

let rateLimitStore: RateLimitStore | null = null;

export function setRateLimitStore(store: RateLimitStore | null): void {
  rateLimitStore = store;
}

interface RateLimitRequest extends RequestWithClaims {
  readonly method?: string;
  readonly route?: { readonly path?: unknown };
  readonly ip?: string;
  readonly body?: Record<string, unknown>;
}

const MAX_CLIENT_ID_LENGTH = 64;

function clientIdOf(request: RateLimitRequest): string {
  const fromBody = request.body?.['client_id'];
  return typeof fromBody === 'string' && fromBody.length > 0 ? fromBody.slice(0, MAX_CLIENT_ID_LENGTH) : '-';
}

/** Authenticated: bucket on `sub`. Otherwise `client_id|ip`: `client_id` is unauthenticated, so the IP must stay in the key or it could be rotated or exhausted. */
function readBucketIdentity(request: RateLimitRequest): string {
  const sub = request.user?.sub;
  if (typeof sub === 'string' && sub.length > 0) {
    return sub;
  }
  return `${clientIdOf(request)}|${request.ip ?? 'anonymous'}`;
}

/** The route template, never the URL: a bucket per concrete URL would let a caller mint a fresh budget by changing a path parameter or query. */
function readRouteTemplate(request: RateLimitRequest, context: ExecutionContext): string {
  const path = request.route?.path;
  if (typeof path === 'string' && path.length > 0) {
    return path;
  }
  return `${context.getClass().name}.${context.getHandler().name}`;
}

/** Token-endpoint identity `client_id|grant_type|sha256(credential)`: one small bucket per credential, so garbage of one visitor cannot drain others. */
function readCredentialIdentity(request: RateLimitRequest): string | undefined {
  const body = request.body;
  const grant = body?.['grant_type'];
  const secret = grant === 'authorization_code' ? body?.['code'] : grant === 'refresh_token' ? body?.['refresh_token'] : undefined;
  if (typeof grant !== 'string' || typeof secret !== 'string' || secret.length === 0) {
    return undefined;
  }
  return `${clientIdOf(request)}|${grant}|${createHash('sha256').update(secret).digest('hex')}`;
}

function buildRateLimitKey(request: RateLimitRequest, context: ExecutionContext, identity = readBucketIdentity(request)): string {
  const route = `${request.method ?? 'GET'}:${readRouteTemplate(request, context)}`;
  const minute = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
  return `${identity}:${route}:${minute}`;
}

/** Longest the guard waits for the store; a hung Redis must not hold every request (fail open instead). */
export const RATE_LIMIT_STORE_TIMEOUT_MS = 500;

class StoreTimeoutError extends Error {
  constructor() {
    super(`Rate-limit store did not answer within ${RATE_LIMIT_STORE_TIMEOUT_MS} ms`);
  }
}

async function incrementWithin(
  store: RateLimitStore,
  key: string,
  windowSeconds: number,
): Promise<number> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new StoreTimeoutError()), RATE_LIMIT_STORE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([store.increment(key, windowSeconds), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const store = rateLimitStore;
    if (store === null) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RateLimitRequest>();
    const ceiling = this.reflector.getAllAndOverride<number | undefined>(RATE_LIMIT_CREDENTIAL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const credential = ceiling === undefined ? undefined : readCredentialIdentity(request);
    if (ceiling !== undefined && credential !== undefined) {
      const addressKey = buildRateLimitKey(request, context, `ceiling|${request.ip ?? 'anonymous'}`);
      if (!(await this.withinBudget(store, addressKey, ceiling))) {
        return this.reject(context);
      }
      const credentialKey = buildRateLimitKey(request, context, credential);
      if (!(await this.withinBudget(store, credentialKey, this.resolveLimit(context)))) {
        return this.reject(context);
      }
      return true;
    }

    if (!(await this.withinBudget(store, buildRateLimitKey(request, context), this.resolveLimit(context)))) {
      return this.reject(context);
    }
    return true;
  }

  private async withinBudget(store: RateLimitStore, key: string, limit: number): Promise<boolean> {
    try {
      return (await incrementWithin(store, key, WINDOW_SECONDS)) <= limit;
    } catch (error: unknown) {
      this.logger.warn({ err: error, key }, 'Rate-limit store unreachable; failing open');
      return true;
    }
  }

  private reject(context: ExecutionContext): never {
    context.switchToHttp().getResponse<Response>().header('Retry-After', String(WINDOW_SECONDS));
    throw new HttpException(
      {
        errorCode: 'RATE_LIMITED',
        message: `Rate limit exceeded, retry in ${WINDOW_SECONDS}s`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private resolveLimit(context: ExecutionContext): number {
    const handlerLimit = this.reflector.getAllAndOverride<number | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (handlerLimit !== undefined && Number.isFinite(handlerLimit) && handlerLimit > 0) {
      return handlerLimit;
    }
    const parsed = rateLimitEnvSchema.safeParse(process.env);
    return parsed.success ? parsed.data.RATE_LIMIT_PER_MINUTE : DEFAULT_LIMIT_PER_MINUTE;
  }
}
