import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirSearchResult } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { addClinicDays, clinicDateOf, clinicInstantMs } from '../src/common/clinic-calendar';
import { InMemoryCacheStore } from '../src/modules/cache/__tests__/in-memory-cache-store';
import { CACHE_STORE } from '../src/modules/cache/redis-cache.service';
import { applyE2eEnv } from './e2e-env';
import { bearer, DOCTOR_SCOPE, PATIENT_SCOPE } from './e2e-tokens';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

/**
 * Dates are derived from the clock: the endpoint clamps the past and refuses a
 * `from` more than a year ahead, so fixed calendar dates would rot.
 */
const TODAY = clinicDateOf(Date.now());
const FROM = addClinicDays(TODAY, 2);
const TO = addClinicDays(TODAY, 8);
const RANGE = `from=${FROM}&to=${TO}`;
/** 09:00 and 09:30 Minsk time on `FROM`. */
const NINE = new Date(clinicInstantMs(FROM, 9 * 60)).toISOString();
const NINE_THIRTY = new Date(clinicInstantMs(FROM, 9 * 60 + 30)).toISOString();
const TEN = new Date(clinicInstantMs(FROM, 10 * 60)).toISOString();
const FROM_DD_MM_YYYY = FROM.split('-').reverse().join('.');

function bundle(resources: ReadonlyArray<Record<string, unknown>>): FhirSearchResult {
  return { entry: resources.map((resource) => ({ resource: { resourceType: 'Unknown', ...resource } })) };
}

const SCHEDULE = {
  resourceType: 'Schedule',
  id: 'sched-1',
  active: true,
  actor: [{ reference: 'PractitionerRole/role-7' }, { reference: 'Location/room-204' }],
};

const SLOTS = [
  { resourceType: 'Slot', id: 'slot-2', status: 'busy', start: NINE_THIRTY, end: TEN, schedule: { reference: 'Schedule/sched-1' } },
  { resourceType: 'Slot', id: 'slot-1', status: 'free', start: NINE, end: NINE_THIRTY, schedule: { reference: 'Schedule/sched-1' } },
];

function createFhirStub(): jest.Mocked<FhirClient> {
  const stub = { search: jest.fn(), read: jest.fn() } as unknown as jest.Mocked<FhirClient>;
  stub.read.mockResolvedValue({ resourceType: 'Practitioner', id: 'prac-1' });
  stub.search.mockImplementation(async (resourceType, params) => {
    if (resourceType === 'PractitionerRole') return bundle([{ id: 'role-7' }]);
    if (resourceType === 'Schedule') return bundle([SCHEDULE]);
    const statuses = String((params ?? {})['status']).split(',');
    return bundle(SLOTS.filter((slot) => statuses.includes(slot.status)));
  });
  return stub;
}

function searchesOf(stub: jest.Mocked<FhirClient>, resourceType: string): ReadonlyArray<Record<string, unknown>> {
  return stub.search.mock.calls.filter(([type]) => type === resourceType).map(([, params]) => params ?? {});
}

/**
 * API §5.2.7 / §5.2.8 through the real guard stack, validation pipe and
 * problem filter. HAPI is stubbed at `FHIR_CLIENT` and Redis at `CACHE_STORE`.
 */
describe('Doctor slots and schedule (e2e)', () => {
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;

  beforeEach(async () => {
    applyE2eEnv();
    fhir = createFhirStub();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FHIR_CLIENT)
      .useValue(fhir)
      .overrideProvider(CACHE_STORE)
      .useValue(new InMemoryCacheStore())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  describe('GET /api/v1/doctors/{id}/slots (public)', () => {
    const slotsUrl = (query: string): string => `/api/v1/doctors/prac-1/slots?${query}`;

    it('should list the free slots without a token when the doctor has a schedule', async () => {
      // Act
      const response = await request(app.getHttpServer()).get(slotsUrl(RANGE)).expect(200);

      // Assert
      expect(response.body).toEqual({
        doctorId: 'prac-1',
        from: FROM,
        to: TO,
        items: [{ id: 'slot-1', scheduleId: 'sched-1', start: NINE, end: NINE_THIRTY, status: 'free' }],
      });
    });

    it('should answer a repeated request from the cache when the range is the same', async () => {
      // Act
      await request(app.getHttpServer()).get(slotsUrl(RANGE)).expect(200);
      await request(app.getHttpServer()).get(slotsUrl(RANGE)).expect(200);

      // Assert
      expect(searchesOf(fhir, 'Slot')).toHaveLength(1);
    });

    it('should answer from the same cache entries when the window is spelled as date-times', async () => {
      // Arrange — the public route must not mint a key per spelling of one window.
      const spelled = `from=${FROM}T00:00:00.000Z&to=${TO}T12:00:00Z`;

      // Act
      await request(app.getHttpServer()).get(slotsUrl(RANGE)).expect(200);
      const response = await request(app.getHttpServer()).get(slotsUrl(spelled)).expect(200);

      // Assert
      expect(searchesOf(fhir, 'Slot')).toHaveLength(1);
      expect(response.body.items.map((slot: { id: string }) => slot.id)).toEqual(['slot-1']);
    });

    it('should reject the call with 400 VALIDATION_ERROR when the range is longer than 31 days', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get(slotsUrl(`from=${FROM}&to=${addClinicDays(FROM, 40)}`))
        .expect(400);

      // Assert
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should reject the call with 400 VALIDATION_ERROR when the range starts more than a year ahead', async () => {
      // Arrange
      const farFrom = addClinicDays(TODAY, 400);

      // Act
      const response = await request(app.getHttpServer())
        .get(slotsUrl(`from=${farFrom}&to=${addClinicDays(farFrom, 3)}`))
        .expect(400);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should reject the call with 400 VALIDATION_ERROR when a date is malformed', async () => {
      // Act
      const response = await request(app.getHttpServer()).get(slotsUrl('from=tomorrow')).expect(400);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    });

    it('should answer 404 NOT_FOUND when the practitioner does not exist', async () => {
      // Arrange
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Practitioner/ghost', 404, '{}'));

      // Act
      const response = await request(app.getHttpServer()).get(`/api/v1/doctors/ghost/slots?${RANGE}`).expect(404);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'NOT_FOUND' });
      expect(searchesOf(fhir, 'Slot')).toHaveLength(0);
    });

    it('should reject the call with 400 VALIDATION_ERROR when the id is not a FHIR id', async () => {
      // Act
      const response = await request(app.getHttpServer()).get('/api/v1/doctors/a,b/slots').expect(400);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.read).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/doctor/schedule (DOCTOR, user/*.read)', () => {
    const doctor = bearer({ role: 'DOCTOR', scope: DOCTOR_SCOPE, fhirUser: 'PractitionerRole/role-7' });

    it('should reject the call with 401 UNAUTHENTICATED when there is no token', async () => {
      // Act
      const response = await request(app.getHttpServer()).get('/api/v1/doctor/schedule').expect(401);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
    });

    it('should reject the call with 403 FORBIDDEN_SCOPE when the token belongs to a patient', async () => {
      // Arrange
      const token = bearer({ role: 'PATIENT', scope: PATIENT_SCOPE, patient: 'p-1', fhirUser: 'Patient/p-1' });

      // Act
      const response = await request(app.getHttpServer()).get('/api/v1/doctor/schedule').set('Authorization', token).expect(403);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
    });

    it('should reject the call with 403 FORBIDDEN_ROLE when the token belongs to an admin', async () => {
      // Arrange
      const token = bearer({ role: 'ADMIN', scope: DOCTOR_SCOPE });

      // Act
      const response = await request(app.getHttpServer()).get('/api/v1/doctor/schedule').set('Authorization', token).expect(403);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
    });

    it('should fail closed with 403 COMPARTMENT_VIOLATION when the doctor token has no fhirUser', async () => {
      // Arrange
      const token = bearer({ role: 'DOCTOR', scope: DOCTOR_SCOPE });

      // Act
      const response = await request(app.getHttpServer()).get('/api/v1/doctor/schedule').set('Authorization', token).expect(403);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should return the schedules and the free and busy slots when the token carries a PractitionerRole', async () => {
      // Act
      const response = await request(app.getHttpServer()).get(`/api/v1/doctor/schedule?${RANGE}`).set('Authorization', doctor).expect(200);

      // Assert
      expect(response.body.practitionerRoleId).toBe('role-7');
      expect(response.body.schedules).toEqual([{ id: 'sched-1', isActive: true, practitionerRoleId: 'role-7', roomId: 'room-204', windows: [] }]);
      expect(response.body.items.map((slot: { id: string }) => slot.id)).toEqual(['slot-1', 'slot-2']);
      expect(response.body.items[0]).toMatchObject({ status: 'free', label: `${FROM_DD_MM_YYYY} 09:00–09:30 · свободен` });
    });

    it('should use the token identity when a role is smuggled through the query', async () => {
      // Act
      await request(app.getHttpServer())
        .get(`/api/v1/doctor/schedule?${RANGE}&practitionerRoleId=role-8&actor=PractitionerRole/role-8`)
        .set('Authorization', doctor)
        .expect(200);

      // Assert
      expect(searchesOf(fhir, 'Schedule')[0]).toMatchObject({ actor: 'PractitionerRole/role-7' });
    });
  });
});
