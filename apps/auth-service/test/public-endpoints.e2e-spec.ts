import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { startAuthApp } from './app-harness';
import { expectProblem } from './problem-assertions';

jest.mock(
  'jose',
  () => jest.requireActual<typeof import('./synthetic-token')>('./synthetic-token').joseStub,
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Liveness, service metadata and the shared HTTP envelope (RFC 7807, correlation id) on the public surface. */
describe('Public endpoints and the shared error envelope', () => {
  let app: INestApplication;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());

  beforeAll(async () => {
    app = (await startAuthApp()).app;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /health', () => {
    it('should answer 200 with the service name when no token is presented', async () => {
      const response = await api().get('/health').expect(200);

      expect(response.body).toEqual({ status: 'ok', service: 'auth-service' });
    });

    it('should carry no personal data when the liveness probe answers', async () => {
      const response = await api().get('/health').expect(200);

      expect(Object.keys(response.body).sort()).toEqual(['service', 'status']);
    });
  });

  describe('GET /', () => {
    it('should identify the service without a token', async () => {
      const response = await api().get('/').expect(200);

      expect(response.body).toEqual({ service: 'auth-service', status: 'ok' });
    });
  });

  describe('correlation id', () => {
    it('should echo a well-formed X-Request-Id on the response when the caller sends one', async () => {
      const response = await api().get('/health').set('x-request-id', 'trace-public-1').expect(200);

      expect(response.headers['x-request-id']).toBe('trace-public-1');
    });

    it('should generate a UUID when the caller sends none', async () => {
      const response = await api().get('/health').expect(200);

      expect(response.headers['x-request-id']).toMatch(UUID);
    });

    it('should replace a malformed X-Request-Id instead of reflecting it', async () => {
      const response = await api()
        .get('/health')
        .set('x-request-id', 'bad id with spaces')
        .expect(200);

      expect(response.headers['x-request-id']).toMatch(UUID);
    });

    it('should put the same id into the problem document when a request fails', async () => {
      const response = await api().get('/api/v1/me').set('x-request-id', 'trace-public-2');

      expect(response.body).toMatchObject({ requestId: 'trace-public-2', instance: '/api/v1/me' });
      expect(response.headers['x-request-id']).toBe('trace-public-2');
    });
  });

  describe('unknown routes', () => {
    it('should answer 404 NOT_FOUND as problem+json when the route does not exist', async () => {
      expectProblem(await api().get('/api/v1/does-not-exist'), 404, 'NOT_FOUND');
    });

    it('should not reveal a stack trace when the route does not exist', async () => {
      const response = await api().get('/api/v1/does-not-exist');

      expect(JSON.stringify(response.body)).not.toMatch(/at .*\.(ts|js):\d+|node_modules/);
    });
  });
});
