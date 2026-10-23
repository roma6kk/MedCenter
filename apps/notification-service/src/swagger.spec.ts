import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { buildOpenApiDocument, collectModuleControllers, findUndocumentedOperations } from '@medcenter/common';

import { AppModule } from './app/app.module';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;
const EXPECTED_OPERATIONS: readonly string[] = [
  'GET /api/v1/notifications',
  'GET /api/v1/notifications/unread-count',
  'POST /api/v1/notifications/read-all',
  'POST /api/v1/notifications/{id}/read',
];

interface OperationRef {
  readonly key: string;
  readonly operation: NonNullable<OpenAPIObject['paths'][string]['get']>;
}

function operationsOf(document: OpenAPIObject): OperationRef[] {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = item[method];
      return operation ? [{ key: `${method.toUpperCase()} ${path}`, operation }] : [];
    }),
  );
}

describe('notification-service OpenAPI document (API §10)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  let operations: OperationRef[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: collectModuleControllers(AppModule) })
      .useMocker(() => ({}))
      .compile();
    app = moduleRef.createNestApplication();
    document = buildOpenApiDocument(app, { service: 'notification', enabled: true });
    operations = operationsOf(document);
  });

  afterAll(async () => {
    await app.close();
  });

  it('declares the global problemDetails schema', () => {
    expect(document.components?.schemas?.['problemDetails']).toBeDefined();
  });

  it('has no undocumented operation (tag, summary, success response)', () => {
    expect(findUndocumentedOperations(document)).toEqual([]);
  });

  it('tags every operation with the service name', () => {
    expect(operations.filter(({ operation }) => !operation.tags?.includes('notification')).map(({ key }) => key)).toEqual([]);
  });

  it('exposes every API path of the service', () => {
    const keys = operations.map(({ key }) => key);
    expect(EXPECTED_OPERATIONS.filter((expected) => !keys.includes(expected))).toEqual([]);
  });

  it('marks every operation with the bearer scheme', () => {
    const bearer = [{ bearer: [] }];
    const guarded = operations; // the service has no @Public() route
    expect(guarded.length).toBeGreaterThan(0);
    expect(guarded.filter(({ operation }) => JSON.stringify(operation.security) !== JSON.stringify(bearer)).map(({ key }) => key)).toEqual([]);
  });

  it('documents at least one application/problem+json response on every operation', () => {
    const withoutProblem = operations.filter(({ operation }) =>
      !Object.entries(operation.responses ?? {}).some(
        ([status, response]) =>
          /^[45]/.test(status) && response !== undefined && 'content' in response && response.content?.['application/problem+json'] !== undefined,
      ),
    );
    expect(withoutProblem.map(({ key }) => key)).toEqual([]);
  });
});
