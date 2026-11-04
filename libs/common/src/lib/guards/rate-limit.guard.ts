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
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';
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

function buildRateLimitKey(request: RateLimitRequest, context: ExecutionContext): string {
  const identity = readBucketIdentity(request);
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
    const key = buildRateLimitKey(request, context);
    let count: number;
    try {
      count = await incrementWithin(store, key, WINDOW_SECONDS);
    } catch (error: unknown) {
      this.logger.warn({ err: error, key }, 'Rate-limit store unreachable; failing open');
      return true;
    }

    if (count > this.resolveLimit(context)) {
      context.switchToHttp().getResponse<Response>().header('Retry-After', String(WINDOW_SECONDS));
      throw new HttpException(
        {
          errorCode: 'RATE_LIMITED',
          message: `Rate limit exceeded, retry in ${WINDOW_SECONDS}s`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
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
