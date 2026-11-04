import type { INestApplication } from '@nestjs/common';

import { JsonLogger } from './json-logger';
import { MetricsRegistry } from './metrics';
import { readinessChecksFromEnv, runReadiness, type ReadinessCheck, type ReadinessDependency } from './readiness';

interface ExpressRequest {
  readonly method: string;
  readonly baseUrl?: string;
  readonly route?: { readonly path?: unknown };
}

interface ExpressResponse {
  statusCode: number;
  status(code: number): ExpressResponse;
  setHeader(name: string, value: string): unknown;
  send(body: unknown): unknown;
  json(body: unknown): unknown;
  once(event: 'finish' | 'close', listener: () => void): unknown;
}

interface ExpressApp {
  use(handler: (request: ExpressRequest, response: ExpressResponse, next: () => void) => void): unknown;
  get(path: string, handler: (request: ExpressRequest, response: ExpressResponse) => void): unknown;
}

export interface ObservabilityOptions {
  /** Service name stamped on every log line and metric, e.g. `auth-service`. */
  readonly service: string;
  /** What `GET /ready` probes; a dependency without its environment variable is skipped. */
  readonly dependencies?: readonly ReadinessDependency[];
  /** Extra checks of the service itself. */
  readonly checks?: readonly ReadinessCheck[];
}

/** The matched route TEMPLATE; a request no route matched (404, a scanner) is one bounded label. */
export function routeTemplate(request: ExpressRequest): string {
  const path = request.route?.path;
  return typeof path === 'string' ? `${request.baseUrl ?? ''}${path}` : 'unmatched';
}

/**
 * NFR-007 for one service, called from `main.ts` right after the app is created:
 * the structured JSON logger, RED request metrics, `GET /ready` (503 with the
 * failed dependency names when one is unreachable) and `GET /metrics`
 * (Prometheus text). The two routes are raw Express routes, ahead of the guard
 * stack, and Traefik has no rule for them: they are reachable on the internal
 * network only, never from the public edge.
 */
export function applyObservability(
  app: INestApplication,
  options: ObservabilityOptions,
  env: NodeJS.ProcessEnv = process.env,
): MetricsRegistry {
  app.useLogger(new JsonLogger(options.service, {}, env));
  const registry = new MetricsRegistry(options.service);
  const checks = [...readinessChecksFromEnv(options.dependencies ?? [], env), ...(options.checks ?? [])];
  const express = app.getHttpAdapter().getInstance() as ExpressApp;

  express.use((request, response, next) => {
    const started = process.hrtime.bigint();
    let recorded = false;
    const record = (): void => {
      if (recorded) {
        return;
      }
      recorded = true;
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      registry.observeRequest(request.method, routeTemplate(request), response.statusCode, seconds);
    };
    response.once('finish', record);
    response.once('close', record);
    next();
  });

  express.get('/metrics', (_request, response) => {
    response.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    response.send(registry.render());
  });

  express.get('/ready', (_request, response) => {
    void runReadiness(checks).then((report) => {
      response.status(report.ok ? 200 : 503).json(
        report.ok
          ? { status: 'ok', service: options.service }
          : { status: 'unavailable', service: options.service, failed: report.failed },
      );
    });
  });
  return registry;
}
