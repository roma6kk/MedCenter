import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import { buildOpenApiDocument, collectModuleControllers, findUndocumentedOperations } from '@medcenter/common';

import { AppModule } from './app/app.module';

interface OperationLike {
  readonly security?: ReadonlyArray<Record<string, unknown>>;
  readonly responses?: Record<string, { readonly content?: Record<string, unknown> }>;
}

const METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;

function operationsOf(document: OpenAPIObject): Array<{ label: string; path: string; operation: OperationLike }> {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    METHODS.flatMap((method) => {
      const operation = (item as Record<string, OperationLike | undefined>)[method];
      return operation ? [{ label: `${method.toUpperCase()} ${path}`, path, operation }] : [];
    }),
  );
}

describe('auth-service OpenAPI document (API §10)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: collectModuleControllers(AppModule) })
      .useMocker(() => ({}))
      .compile();
    app = moduleRef.createNestApplication();
    document = buildOpenApiDocument(app, { service: 'auth', enabled: true });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should expose the global problemDetails schema', () => {
    expect(document.components?.schemas?.['problemDetails']).toBeDefined();
  });

  it('should document every operation with a tag, a summary and a success response', () => {
    expect(findUndocumentedOperations(document)).toEqual([]);
  });

  it.each([
    '/.well-known/smart-configuration',
    '/.well-known/jwks.json',
    '/oauth/authorize',
    '/oauth/login',
    '/oauth/token',
    '/oauth/token/revoke',
    '/api/v1/auth/register',
    '/api/v1/me',
    '/api/v1/admin/users',
    '/api/v1/admin/users/{id}',
    '/api/v1/terminology/value-sets',
    '/api/v1/terminology/value-sets/{url}/$expand',
    '/api/v1/terminology/expand',
    '/api/v1/terminology/validate',
    '/api/v1/admin/terminology/import',
    '/health',
  ])('should contain the path %s', (path) => {
    expect(Object.keys(document.paths)).toContain(path);
  });

  it('should require a Bearer token on every guarded operation and on none of the public ones', () => {
    const publicLabels = [
      'GET /',
      'GET /health',
      'GET /.well-known/smart-configuration',
      'GET /.well-known/jwks.json',
      'GET /oauth/authorize',
      'POST /oauth/login',
      'POST /oauth/token',
      'POST /api/v1/auth/register',
    ];
    const operations = operationsOf(document);
    expect(operations.some(({ operation }) => operation.security?.some((entry) => 'bearer' in entry))).toBe(true);
    for (const { label, operation } of operations) {
      if (publicLabels.includes(label)) {
        expect(operation.security).toBeUndefined();
      } else {
        expect({ label, security: operation.security }).toEqual({ label, security: [{ bearer: [] }] });
      }
    }
  });

  it('should declare an application/problem+json response on every operation', () => {
    const withoutProblem = operationsOf(document)
      .filter(({ operation }) => !Object.values(operation.responses ?? {}).some((response) => response.content?.['application/problem+json']))
      .map(({ label }) => label);
    expect(withoutProblem).toEqual([]);
  });
});
