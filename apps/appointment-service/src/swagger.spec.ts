import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import {
  buildOpenApiDocument,
  collectModuleControllers,
  findUndocumentedOperations,
} from '@medcenter/common';

import { AppModule } from './app/app.module';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;

/** Every `METHOD /path` of the document with its operation. */
function operationsOf(
  document: OpenAPIObject,
): Array<{ label: string; path: string; operation: Record<string, unknown> }> {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    HTTP_METHODS.filter((method) => item[method] !== undefined).map((method) => ({
      label: `${method.toUpperCase()} ${path}`,
      path,
      operation: item[method] as unknown as Record<string, unknown>,
    })),
  );
}

describe('appointment-service OpenAPI document (API §10)', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: collectModuleControllers(AppModule),
    })
      .useMocker(() => ({}))
      .compile();
    const app = moduleRef.createNestApplication();
    document = buildOpenApiDocument(app, { service: 'appointment', enabled: true });
    await app.close();
  });

  it('should carry the global problemDetails schema', () => {
    expect(document.components?.schemas?.['problemDetails']).toBeDefined();
  });

  it('should document every operation with a tag, a summary and a success response', () => {
    expect(findUndocumentedOperations(document)).toEqual([]);
  });

  it('should expose every /api/v1 path of API §6', () => {
    const expected = [
      '/api/v1/appointments',
      '/api/v1/appointments/{id}',
      '/api/v1/appointments/{id}/cancel',
      '/api/v1/doctor/appointments',
      '/api/v1/doctor/appointments/{id}/noshow',
    ];
    const apiPaths = Object.keys(document.paths).filter((path) => path.startsWith('/api/v1/'));
    expect(apiPaths.sort()).toEqual([...expected].sort());
    expect(operationsOf(document)).toHaveLength(7);
  });

  it('should tag every operation with the service name', () => {
    for (const { label, operation } of operationsOf(document)) {
      expect({ label, tags: operation['tags'] }).toEqual({ label, tags: ['appointment'] });
    }
  });

  it('should require Bearer on guarded operations and not on the public ones', () => {
    const publicLabels = ['GET /health'];
    for (const { label, operation } of operationsOf(document)) {
      if (publicLabels.includes(label)) {
        expect({ label, security: operation['security'] }).toEqual({ label, security: undefined });
      } else {
        expect({ label, security: operation['security'] }).toEqual({
          label,
          security: [{ bearer: [] }],
        });
      }
    }
  });

  it('should document at least one application/problem+json response on every operation', () => {
    for (const { label, operation } of operationsOf(document)) {
      const responses = operation['responses'] as Record<
        string,
        { content?: Record<string, unknown> }
      >;
      const problems = Object.values(responses).filter(
        (response) => response.content?.['application/problem+json'] !== undefined,
      );
      expect({ label, count: problems.length > 0 }).toEqual({ label, count: true });
    }
  });

  it('should answer the documented success status of each handler', () => {
    const successOf = (label: string): string[] =>
      Object.keys(
        (operationsOf(document).find((entry) => entry.label === label)?.operation['responses'] ??
          {}) as object,
      ).filter((status) => /^2/.test(status));
    expect(successOf('POST /api/v1/appointments')).toEqual(['201']);
    expect(successOf('POST /api/v1/appointments/{id}/cancel')).toEqual(['200']);
    expect(successOf('POST /api/v1/doctor/appointments/{id}/noshow')).toEqual(['200']);
  });

  it('should document the Idempotency-Key header of the booking', () => {
    const post = document.paths['/api/v1/appointments']?.post;
    expect(post?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Idempotency-Key', in: 'header' })]),
    );
  });

  it('should expand the listing queries into query parameters', () => {
    const names = (path: string): string[] =>
      (document.paths[path]?.get?.parameters ?? []).map((parameter) =>
        'name' in parameter ? parameter.name : '',
      );
    expect(names('/api/v1/appointments')).toEqual(
      expect.arrayContaining(['page', 'pageSize', 'sortOrder', 'upcoming', 'status']),
    );
    expect(names('/api/v1/doctor/appointments')).toEqual(
      expect.arrayContaining(['page', 'pageSize', 'sortOrder', 'from', 'to']),
    );
  });
});
