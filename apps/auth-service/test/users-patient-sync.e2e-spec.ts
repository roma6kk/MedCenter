import type { INestApplication } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import { FhirClientError } from '@medcenter/fhir';
import request from 'supertest';

import { createdOf, transactionWrites } from '../src/modules/users/__tests__/users-harness';
import { startWithAdmin, type AdminFixture } from './admin-fixture';
import { AUTH_USER_SYSTEM, REGISTRATION, storedPatient } from './users-helpers';

jest.mock(
  'jose',
  () => jest.requireActual<typeof import('./synthetic-token')>('./synthetic-token').joseStub,
);

const HAPI_URL = 'http://hapi.internal:8080/fhir';

/**
 * The `Patient` of a PATIENT account (FR-018, ADR-012): what the auth service writes to HAPI when
 * the account is created, and how an admin PATCH keeps the resource in step under `If-Match`.
 */
describe('Users API — the Patient resource in HAPI', () => {
  let fixture: AdminFixture;
  let app: INestApplication;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());
  const asAdmin = (test: request.Test): request.Test =>
    test.set('authorization', fixture.adminAuthorization);
  const fakes = (): AdminFixture['started']['fakes'] => fixture.started.fakes;

  const registerAnna = (email: string): request.Test =>
    api()
      .post('/api/v1/auth/register')
      .send({ ...REGISTRATION, email });

  beforeAll(async () => {
    fixture = await startWithAdmin();
    app = fixture.app;
  });

  afterAll(async () => {
    await fixture?.close();
  });

  describe('when the account is created', () => {
    it('should create an R4 Patient with the account identifier, official name, email and demographics when a patient registers', async () => {
      const response = await registerAnna('anna@example.by').expect(201);

      expect(createdOf(fakes().fhir, 'Patient').at(-1)).toEqual({
        resourceType: 'Patient',
        active: true,
        identifier: [{ system: AUTH_USER_SYSTEM, value: response.body.id }],
        name: [{ use: 'official', family: 'Орлова', given: ['Анна'] }],
        telecom: [{ system: 'email', value: 'anna@example.by', use: 'home' }],
        birthDate: '1991-03-04',
        gender: 'female',
      });
    });

    it('should link the server-assigned Patient id and publish patient.registered.v1 with the bare id when a patient registers', async () => {
      const response = await registerAnna('linked@example.by').expect(201);

      const patientId = String(response.body.patientRef).replace('Patient/', '');
      expect(response.body.patientRef).toMatch(/^Patient\/.+/);
      expect(fakes().publisher.publish).toHaveBeenLastCalledWith({
        v: 1,
        type: 'patient.registered.v1',
        eventId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        patientId,
        email: 'linked@example.by',
      });
    });

    it('should create the same Patient shape when an administrator creates a PATIENT account', async () => {
      const response = await asAdmin(api().post('/api/v1/admin/users'))
        .send({ ...REGISTRATION, email: 'by-admin@example.by', roles: [Role.PATIENT] })
        .expect(201);

      expect(createdOf(fakes().fhir, 'Patient').at(-1)).toMatchObject({
        identifier: [{ system: AUTH_USER_SYSTEM, value: response.body.id }],
        name: [{ use: 'official', family: 'Орлова', given: ['Анна'] }],
        birthDate: '1991-03-04',
        gender: 'female',
      });
    });

    it('should answer 502 and leave no account when HAPI is unavailable while the Patient is created', async () => {
      const before = fakes().store.users.size;
      fakes().fhir.create.mockRejectedValueOnce(new FhirClientError('POST', HAPI_URL, 503));

      const response = await registerAnna('hapi-down@example.by');

      expect(response.status).toBe(502);
      expect(response.body).toMatchObject({ errorCode: 'INTERNAL' });
      expect(fakes().store.users.size).toBe(before);
    });

    it('should delete the Patient HAPI stored under the account identifier when the create timed out', async () => {
      const before = fakes().store.users.size;
      fakes().fhir.create.mockRejectedValueOnce(
        new FhirClientError('POST', HAPI_URL, undefined, undefined, { timedOut: true }),
      );
      fakes().fhir.search.mockResolvedValueOnce({
        entry: [{ resource: { resourceType: 'Patient', id: 'orphan-1' } }],
      });

      const response = await registerAnna('hapi-timeout@example.by');

      expect(response.status).toBe(504);
      expect(fakes().fhir.search).toHaveBeenLastCalledWith('Patient', {
        identifier: expect.stringContaining(`${AUTH_USER_SYSTEM}|`),
        _elements: 'id',
      });
      expect(fakes().fhir.delete).toHaveBeenCalledWith('Patient', 'orphan-1');
      expect(fakes().store.users.size).toBe(before);
    });
  });

  describe('when an administrator patches the account (If-Match, ADR-012)', () => {
    let account: { readonly id: string; readonly patientId: string };
    let sequence = 0;

    const patch = (body: Record<string, unknown>): request.Test =>
      asAdmin(api().patch(`/api/v1/admin/users/${account.id}`)).send(body);
    const card = async (): Promise<Record<string, unknown>> =>
      (await asAdmin(api().get(`/api/v1/admin/users/${account.id}`)).expect(200)).body;
    const defaultRead = async (type: string, id: string): Promise<never> =>
      ({ resourceType: type, id, meta: { versionId: '1' } }) as never;

    beforeEach(async () => {
      sequence += 1;
      const registered = (await registerAnna(`patch-${sequence}@example.by`).expect(201)).body;
      account = {
        id: registered.id,
        patientId: String(registered.patientRef).replace('Patient/', ''),
      };
      fakes().fhir.batch.mockClear();
      fakes().fhir.read.mockImplementation(async (type, id) =>
        type === 'Patient' ? (storedPatient(id, account.id) as never) : defaultRead(type, id),
      );
    });

    afterEach(() => {
      fakes().fhir.read.mockImplementation(defaultRead);
    });

    it('should PUT the Patient in a transaction Bundle guarded by the version it read when demographics change', async () => {
      await patch({ lastName: 'Соколова', birthDate: '1991-04-05', gender: 'male' }).expect(200);

      expect(fakes().fhir.read).toHaveBeenCalledWith('Patient', account.patientId);
      expect(fakes().fhir.batch).toHaveBeenCalledTimes(1);
      expect(fakes().fhir.batch.mock.calls[0]?.[0]).toMatchObject({
        resourceType: 'Bundle',
        type: 'transaction',
      });
      expect(transactionWrites(fakes().fhir)).toEqual([
        {
          url: `Patient/${account.patientId}`,
          ifMatch: 'W/"7"',
          resource: expect.objectContaining({
            resourceType: 'Patient',
            id: account.patientId,
            birthDate: '1991-04-05',
            gender: 'male',
          }),
        },
      ]);
    });

    it('should change only the official name and keep every other name, contact and identifier when the last name changes', async () => {
      await patch({ lastName: 'Соколова' }).expect(200);

      const [write] = transactionWrites(fakes().fhir);
      expect(write?.resource).toMatchObject({
        identifier: [{ system: AUTH_USER_SYSTEM, value: account.id }],
        name: [
          { use: 'official', family: 'Соколова', given: ['Анна'] },
          { use: 'nickname', given: ['Аня'] },
        ],
        telecom: expect.arrayContaining([
          { system: 'phone', value: '+375291112233', use: 'mobile' },
        ]),
      });
    });

    it('should replace only the home email entry of the Patient when the account email changes', async () => {
      await patch({ email: 'Renamed@Example.by' }).expect(200);

      const [write] = transactionWrites(fakes().fhir);
      expect(write?.resource['telecom']).toEqual([
        { system: 'email', value: 'renamed@example.by', use: 'home' },
        { system: 'phone', value: '+375291112233', use: 'mobile' },
      ]);
    });

    it('should not touch the Patient when the PATCH changes only isActive', async () => {
      await patch({ isActive: false }).expect(200);

      expect(fakes().fhir.read).not.toHaveBeenCalledWith('Patient', account.patientId);
      expect(fakes().fhir.batch).not.toHaveBeenCalled();
    });

    it('should answer 409 CONFLICT without the HAPI address and keep the account when the Patient changed meanwhile', async () => {
      const before = await card();
      fakes().fhir.batch.mockRejectedValueOnce(new FhirClientError('POST', HAPI_URL, 412));

      const response = await patch({ lastName: 'Соколова' });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ errorCode: 'CONFLICT' });
      expect(JSON.stringify(response.body)).not.toContain('hapi.internal');
      expect(await card()).toEqual(before);
    });

    it('should answer 502 INTERNAL and keep the account when HAPI is unavailable during the sync', async () => {
      const before = await card();
      fakes().fhir.batch.mockRejectedValueOnce(new FhirClientError('POST', HAPI_URL, 503));

      const response = await patch({ lastName: 'Соколова' });

      expect(response.status).toBe(502);
      expect(response.body).toMatchObject({ errorCode: 'INTERNAL' });
      expect(await card()).toEqual(before);
    });

    it('should answer 504 and converge on the repeated PATCH when HAPI times out and may have stored the change', async () => {
      fakes().fhir.batch.mockRejectedValueOnce(
        new FhirClientError('POST', HAPI_URL, undefined, undefined, { timedOut: true }),
      );

      const timedOut = await patch({ lastName: 'Соколова' });
      const repeated = await patch({ lastName: 'Соколова' });

      expect(timedOut.status).toBe(504);
      expect(repeated.status).toBe(200);
      expect(await card()).toMatchObject({ lastName: 'Соколова' });
      expect(transactionWrites(fakes().fhir).at(-1)?.resource).toMatchObject({
        name: [{ family: 'Соколова' }, expect.anything()],
      });
    });
  });
});
