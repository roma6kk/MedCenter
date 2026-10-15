import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { startWithAdmin, type AdminFixture } from './admin-fixture';
import { expectProblem } from './problem-assertions';

jest.mock(
  'jose',
  () => jest.requireActual<typeof import('./synthetic-token')>('./synthetic-token').joseStub,
);

const IMPORT_URL = '/api/v1/admin/terminology/import';

/** API §2.3.4 — what the import endpoint refuses before it takes the lock or writes to HAPI. */
describe('Terminology import API — request validation', () => {
  let fixture: AdminFixture;
  let app: INestApplication;

  const post = (): request.Test =>
    request(app.getHttpServer()).post(IMPORT_URL).set('authorization', fixture.adminAuthorization);
  const hapiWrites = (): number => {
    const { fhir } = fixture.started.fakes;
    return [fhir.update, fhir.delete, fhir.batch].reduce(
      (sum, fn) => sum + fn.mock.calls.length,
      0,
    );
  };

  beforeAll(async () => {
    fixture = await startWithAdmin();
    app = fixture.app;
  });

  afterAll(async () => {
    await fixture?.close();
  });

  it.each([
    ['an array', '[]'],
    ['a bare JSON string', '"1.4.463"'],
    ['an object with a null snapshotVersion', '{"snapshotVersion":null}'],
    ['an object with a numeric snapshotVersion', '{"snapshotVersion":1.4}'],
    ['an object with a pre-release snapshotVersion', '{"snapshotVersion":"1.4.463-rc1"}'],
    [
      'an object with a snapshotVersion that smuggles a suffix',
      '{"snapshotVersion":"1.4.463; DROP"}',
    ],
    [
      'an object with a snapshotVersion over 32 characters',
      `{"snapshotVersion":"1.${'0'.repeat(40)}"}`,
    ],
  ])(
    'should answer 400 VALIDATION_ERROR and write nothing to HAPI when the body is %s',
    async (_label, raw) => {
      const response = await post().set('content-type', 'application/json').send(raw);

      expectProblem(response, 400, 'VALIDATION_ERROR');
      expect(hapiWrites()).toBe(0);
    },
  );

  it('should answer 400 VALIDATION_ERROR when the body is not parseable JSON', async () => {
    const response = await post()
      .set('content-type', 'application/json')
      .send('{"snapshotVersion": ');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('should answer 400 VALIDATION_ERROR when the request carries no body', async () => {
    expectProblem(await post(), 400, 'VALIDATION_ERROR');
  });
});
