import type { INestApplication } from '@nestjs/common';
import { FhirClientError, type FhirClient } from '@medcenter/fhir';
import request from 'supertest';

import { transactionResponder } from '../src/common/__tests__/audited-transactions';
import { bootWithFhir, createFhirStub, storedRoom, TOKENS } from './rooms-harness';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

const ROOMS = '/api/v1/admin/rooms';

/** Unique `Location.identifier` of a room (API §4.4, §4.5) over HTTP: a taken identifier is `409 CONFLICT`. */
describe('Room identifier uniqueness (e2e)', () => {
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;

  beforeEach(async () => {
    fhir = createFhirStub();
    fhir.search.mockResolvedValue({ entry: [{ resource: storedRoom() }, { resource: storedRoom({ id: 'room-101', identifier: [{ value: '101' }] }) }] });
    fhir.read.mockImplementation(async () => storedRoom());
    fhir.batch.mockImplementation(transactionResponder());
    app = await bootWithFhir(fhir);
  });

  afterEach(async () => {
    await app?.close();
  });

  it('should answer 409 CONFLICT as problem+json and create nothing when the identifier is taken on create', async () => {
    const response = await request(app.getHttpServer())
      .post(ROOMS)
      .set('Authorization', TOKENS.admin)
      .send({ identifier: '204-Х', name: 'Кабинет 204 bis' })
      .expect(409);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ status: 409, errorCode: 'CONFLICT', detail: expect.stringContaining('204-Х') });
    expect(fhir.batch).not.toHaveBeenCalled();
  });

  it('should answer 409 CONFLICT and update nothing when a room is renamed to the identifier of another room', async () => {
    const response = await request(app.getHttpServer())
      .patch(`${ROOMS}/room-204`)
      .set('Authorization', TOKENS.admin)
      .send({ identifier: '101' })
      .expect(409);

    expect(response.body).toMatchObject({ status: 409, errorCode: 'CONFLICT', detail: expect.stringContaining('101') });
    expect(fhir.batch).not.toHaveBeenCalled();
  });

  it('should answer 201 when the identifier is free on create', async () => {
    await request(app.getHttpServer())
      .post(ROOMS)
      .set('Authorization', TOKENS.admin)
      .send({ identifier: '305', name: 'Кабинет 305' })
      .expect(201);

    expect(fhir.batch).toHaveBeenCalledTimes(1);
  });

  it('should answer one 201 and one 409 CONFLICT when two creates of a free identifier race past the read check', async () => {
    // Both requests read "free" at the same moment (a barrier on the first two scans); only then does the store commit one create.
    const waiting: Array<() => void> = [];
    let committed = false;
    fhir.search.mockImplementation(async () => {
      if (!committed && waiting.length < 2) {
        await new Promise<void>((resolve) => {
          waiting.push(resolve);
          if (waiting.length === 2) {
            waiting.forEach((release) => release());
          }
        });
        return { entry: [{ resource: storedRoom() }] };
      }
      return { entry: [{ resource: storedRoom() }, { resource: storedRoom({ id: 'room-winner', identifier: [{ value: '305' }] }) }] };
    });
    // The store applies the conditional create once and refuses the other (HAPI-2279, 400).
    fhir.batch.mockImplementation(async (bundle) => {
      const [room] = bundle['entry'] as Array<{ request: { url: string } }>;
      if (committed && room?.request.url.startsWith('Location?') === true) {
        throw new FhirClientError('POST', 'http://hapi:8080/fhir', 400, 'HAPI-2279');
      }
      committed = true;
      return { resourceType: 'Bundle', type: 'transaction-response', entry: [] };
    });
    const post = (): request.Test =>
      request(app.getHttpServer()).post(ROOMS).set('Authorization', TOKENS.admin).send({ identifier: '305', name: 'Кабинет 305' });

    const responses = await Promise.all([post(), post()]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const refused = responses.find((response) => response.status === 409);
    expect(refused?.body).toMatchObject({ errorCode: 'CONFLICT', detail: expect.stringContaining('305') });
  });
});
