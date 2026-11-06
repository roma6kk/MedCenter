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
  readonly service: string;
  readonly dependencies?: readonly ReadinessDependency[];
  readonly checks?: readonly ReadinessCheck[];
}

export function routeTemplate(request: ExpressRequest): string {
  const path = request.route?.path;
  return typeof path === 'string' ? `${request.baseUrl ?? ''}${path}` : 'unmatched';
}

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
