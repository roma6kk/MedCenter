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
  /** Returns the number of hits in the current window after incrementing it. */
  increment(key: string, windowSeconds: number): Promise<number>;
}

let rateLimitStore: RateLimitStore | null = null;

/** Injects the store (Redis in production, a mock in tests). `null` disables limiting. */
export function setRateLimitStore(store: RateLimitStore | null): void {
  rateLimitStore = store;
}

interface RateLimitRequest extends RequestWithClaims {
  readonly method?: string;
  readonly route?: { readonly path?: unknown };
  readonly ip?: string;
  readonly body?: Record<string, unknown>;
}

/** Longest `client_id` copied into a key; the value is unauthenticated input. */
const MAX_CLIENT_ID_LENGTH = 64;

/**
 * Picks the rate-limit bucket identity.
 *
 * An authenticated principal is bucketed on its `sub`. Without one (e.g. the
 * `@Public()` `POST /oauth/token`), the bucket is `client_id|ip` (M2): two
 * clients behind one NAT get separate budgets, yet the IP always stays in the
 * key. This guard runs before `TokenClientGuard`, so `client_id` is
 * unauthenticated — keying on it alone let one IP rotate `client_id` for fresh
 * buckets and let any IP exhaust a real client's shared bucket. With the IP
 * kept, a rotated `client_id` only buys buckets for ids `TokenClientGuard`
 * rejects (401) before any secret or code is checked.
 */
function readBucketIdentity(request: RateLimitRequest): string {
  const sub = request.user?.sub;
  if (typeof sub === 'string' && sub.length > 0) {
    return sub;
  }
  const fromBody = request.body?.['client_id'];
  const clientId =
    typeof fromBody === 'string' && fromBody.length > 0
      ? fromBody.slice(0, MAX_CLIENT_ID_LENGTH)
      : '-';
  return `${clientId}|${request.ip ?? 'anonymous'}`;
}

/**
 * Names the route by its template (`/api/v1/doctors/:id`), never by the URL the
 * caller sent. A bucket per concrete URL would let any caller mint a fresh
 * budget per request just by changing a path parameter or the query string
 * (`/doctors/a`, `/doctors/b`, `?n=1`, ...). Guards run after routing, so Express
 * has set `request.route`; without it (a non-Express adapter) the handler's
 * class and method name still give one bucket per route.
 */
function readRouteTemplate(request: RateLimitRequest, context: ExecutionContext): string {
  const path = request.route?.path;
  if (typeof path === 'string' && path.length > 0) {
    return path;
  }
  return `${context.getClass().name}.${context.getHandler().name}`;
}

/**
 * Token-endpoint identity: `client_id|grant_type|sha256(code or refresh_token)`. Codes and refresh tokens are
 * high-entropy, so the hash does not weaken guessing resistance; a replayed credential hits one small bucket
 * wherever it comes from, while garbage credentials of one visitor cannot drain the budget of other visitors.
 * Without a usable credential there is nothing to key on and the caller falls back to `client_id|ip`.
 */
function readCredentialIdentity(request: RateLimitRequest): string | undefined {
  const body = request.body;
  const grant = body?.['grant_type'];
  const secret = grant === 'authorization_code' ? body?.['code'] : grant === 'refresh_token' ? body?.['refresh_token'] : undefined;
  if (typeof grant !== 'string' || typeof secret !== 'string' || secret.length === 0) {
    return undefined;
  }
  const fromBody = body?.['client_id'];
  const clientId =
    typeof fromBody === 'string' && fromBody.length > 0 ? fromBody.slice(0, MAX_CLIENT_ID_LENGTH) : '-';
  return `${clientId}|${grant}|${createHash('sha256').update(secret).digest('hex')}`;
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
      // Generous per-address ceiling first (flood of ever-new credentials), then the per-credential budget.
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

    const key = buildRateLimitKey(request, context);
    if (!(await this.withinBudget(store, key, this.resolveLimit(context)))) {
      return this.reject(context);
    }
    return true;
  }

  /** Counts one hit; an unreachable or hung store counts as within budget (fail open). */
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
