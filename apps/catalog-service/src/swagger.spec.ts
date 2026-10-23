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

describe('catalog-service OpenAPI document (API §10)', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: collectModuleControllers(AppModule),
    })
      .useMocker(() => ({}))
      .compile();
    const app = moduleRef.createNestApplication();
    document = buildOpenApiDocument(app, { service: 'catalog', enabled: true });
    await app.close();
  });

  it('should carry the global problemDetails schema', () => {
    expect(document.components?.schemas?.['problemDetails']).toBeDefined();
  });

  it('should document every operation with a tag, a summary and a success response', () => {
    expect(findUndocumentedOperations(document)).toEqual([]);
  });

  it('should expose every /api/v1 path of API §5', () => {
    const expected = [
      '/api/v1/services',
      '/api/v1/services/{id}',
      '/api/v1/admin/services',
      '/api/v1/admin/services/{id}',
      '/api/v1/admin/schedules',
      '/api/v1/admin/schedules/{id}',
      '/api/v1/admin/schedules/{id}/generate',
      '/api/v1/admin/schedules/{id}/slots',
      '/api/v1/doctor/schedule',
      '/api/v1/doctors/{id}/slots',
    ];
    expect(Object.keys(document.paths).sort()).toEqual([...expected].sort());
    expect(operationsOf(document)).toHaveLength(13);
  });

  it('should tag every operation with the service name', () => {
    for (const { label, operation } of operationsOf(document)) {
      expect({ label, tags: operation['tags'] }).toEqual({ label, tags: ['catalog'] });
    }
  });

  it('should require Bearer on guarded operations and not on the public ones', () => {
    const publicLabels = [
      'GET /api/v1/services',
      'GET /api/v1/services/{id}',
      'GET /api/v1/doctors/{id}/slots',
    ];
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
    expect(successOf('POST /api/v1/admin/services')).toEqual(['201']);
    expect(successOf('DELETE /api/v1/admin/services/{id}')).toEqual(['204']);
    expect(successOf('DELETE /api/v1/admin/schedules/{id}')).toEqual(['204']);
    expect(successOf('POST /api/v1/admin/schedules/{id}/generate')).toEqual(['201']);
  });
});
