import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import { buildOpenApiDocument, collectModuleControllers, findUndocumentedOperations } from '@medcenter/common';

import { AppModule } from './app/app.module';

const PROBLEM_JSON = 'application/problem+json';
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;

const EXPECTED_PATHS: readonly string[] = [
  '/api/v1/me/patient',
  '/api/v1/patients/{id}',
  '/api/v1/patients/{id}/related',
  '/api/v1/me/consent',
  '/api/v1/me/consent/revoke',
  '/api/v1/patients/{id}/consent',
  '/api/v1/patients/{id}/consent/revoke',
  '/api/v1/patients/{id}/consent/scan',
  '/api/v1/patients/{id}/consent/scan/{scanId}',
];

/** API §10: the OpenAPI document of patient-service, built from the real controllers. */
describe('patient-service OpenAPI document', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: collectModuleControllers(AppModule) })
      .useMocker(() => ({}))
      .compile();
    const app = moduleRef.createNestApplication();
    document = buildOpenApiDocument(app, { service: 'patient', enabled: true });
    await app.close();
  });

  const operations = (): Array<{ label: string; path: string; method: string; operation: NonNullable<OpenAPIObject['paths'][string]['get']> }> =>
    Object.entries(document.paths).flatMap(([path, item]) =>
      HTTP_METHODS.flatMap((method) => {
        const operation = item[method];
        return operation ? [{ label: `${method.toUpperCase()} ${path}`, path, method, operation }] : [];
      }),
    );

  it('declares the global problemDetails schema', () => {
    expect(document.components?.schemas?.['problemDetails']).toBeDefined();
  });

  it('documents every operation with a tag, a summary and a success response', () => {
    expect(findUndocumentedOperations(document)).toEqual([]);
  });

  it('tags every operation with the service name', () => {
    expect(operations().filter(({ operation }) => !operation.tags?.includes('patient'))).toEqual([]);
  });

  it.each(EXPECTED_PATHS)('serves %s', (path) => {
    expect(Object.keys(document.paths)).toContain(path);
  });

  it('lists no /api/v1 path beyond the expected ones', () => {
    const served = Object.keys(document.paths).filter((path) => path.startsWith('/api/v1'));
    expect([...served].sort()).toEqual([...EXPECTED_PATHS].sort());
  });

  it('marks guarded operations with the bearer scheme and public ones without it', () => {
    const bearer = [{ bearer: [] }];
    const all = operations();
    expect(all.some(({ operation }) => JSON.stringify(operation.security) === JSON.stringify(bearer))).toBe(true);
    const publicLabels: readonly string[] = [
      'GET /health',
    ];
    for (const { label, operation } of all) {
      if (publicLabels.includes(label)) {
        expect(operation.security).toBeUndefined();
      } else {
        expect(operation.security).toEqual(bearer);
      }
    }
  });

  it('answers errors in application/problem+json on every operation', () => {
    const missing = operations()
      .filter(({ operation }) => {
        const errors = Object.entries(operation.responses ?? {}).filter(([status]) => /^[45]/.test(status));
        return !errors.some(([, response]) => PROBLEM_JSON in ((response as { content?: object }).content ?? {}));
      })
      .map(({ label }) => label);
    expect(missing).toEqual([]);
  });
});
