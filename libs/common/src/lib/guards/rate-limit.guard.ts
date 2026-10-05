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
  readonly originalUrl?: string;
  readonly ip?: string;
}

function buildRateLimitKey(request: RateLimitRequest): string {
  const identity = request.user?.sub ?? request.ip ?? 'anonymous';
  const route = `${request.method ?? 'GET'}:${request.originalUrl ?? '/'}`;
  const minute = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
  return `${identity}:${route}:${minute}`;
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
    const key = buildRateLimitKey(request);
    let count: number;
    try {
      count = await store.increment(key, WINDOW_SECONDS);
    } catch (error: unknown) {
      this.logger.warn({ err: error, key }, 'Rate-limit store unreachable; failing open');
      return true;
    }

    if (count > this.resolveLimit(context)) {
      context
        .switchToHttp()
        .getResponse<Response>()
        .header('Retry-After', String(WINDOW_SECONDS));
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
