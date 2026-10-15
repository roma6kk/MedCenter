import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * Marks a response `Cache-Control: no-store`. The account endpoints answer with
 * personal data (names, emails, links to the clinical record), which no
 * browser, proxy or Traefik cache may keep. Set before the handler runs, so
 * the error responses of the route carry it too.
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'no-store');
    return next.handle();
  }
}
