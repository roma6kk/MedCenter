import { FhirClientError } from '@medcenter/fhir';
import request from 'supertest';

import { CACHE_KEYS } from '../src/modules/cache/redis-cache.service';
import {
  PLANNING_HORIZON_EXT,
  SLOT_DURATION_EXT,
  WEEKLY_WINDOWS_EXT,
} from '../src/modules/schedules/schedule.constants';
import { bootCatalog, TOKENS, type CatalogHarness } from './catalog-harness';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

const SCHEDULES = '/api/v1/admin/schedules';
const ROLE_ID = '0a1b2c3d-0000-4000-8000-000000000001';
const ROOM_ID = '0a1b2c3d-0000-4000-8000-000000000002';
const SERVICE_ID = '0a1b2c3d-0000-4000-8000-000000000003';
const MORNING = [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' }];
const VALID_BODY = {
  practitionerRoleId: ROLE_ID,
  roomId: ROOM_ID,
  serviceId: SERVICE_ID,
  horizonFrom: '2026-11-01',
  horizonTo: '2026-11-30',
  windows: MORNING,
  slotDurationMin: 30,
  comment: 'Осенний график',
};

/**
 * Admin schedule writes (API §5.2.1 create, §5.2.4 delete) through the real
 * guard stack, validation pipe and problem filter: the `Schedule` resource that
 * reaches HAPI, and the catalogued `SCHEDULE_OVERLAP` / `SCHEDULE_IN_USE` codes.
 */
describe('Schedules admin writes (e2e)', () => {
  let harness: CatalogHarness;

  beforeEach(async () => {
    harness = await bootCatalog();
    harness.fhir.create.mockImplementation(async (_type, resource) => ({ ...resource, id: 'sched-new' }));
  });

  afterEach(async () => {
    await harness.app?.close();
  });

  describe('POST /api/v1/admin/schedules', () => {
    function post(body: object): request.Test {
      return request(harness.app.getHttpServer()).post(SCHEDULES).set('Authorization', TOKENS.admin).send(body);
    }

    it('should create the Schedule with actors and the three extensions and answer 201 when an admin posts a valid body', async () => {
      // Act
      const response = await post(VALID_BODY).expect(201);

      // Assert
      expect(harness.fhir.search).toHaveBeenCalledWith('Schedule', { actor: `PractitionerRole/${ROLE_ID}`, active: 'true' });
      expect(harness.fhir.create).toHaveBeenCalledWith('Schedule', {
        resourceType: 'Schedule',
        active: true,
        actor: [
          { reference: `PractitionerRole/${ROLE_ID}` },
          { reference: `Location/${ROOM_ID}` },
          { reference: `HealthcareService/${SERVICE_ID}` },
        ],
        extension: [
          { url: SLOT_DURATION_EXT, valueInteger: 30 },
          { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify(MORNING) },
          { url: PLANNING_HORIZON_EXT, valuePeriod: { start: '2026-11-01', end: '2026-11-30' } },
        ],
        comment: 'Осенний график',
      });
      expect(response.body).toMatchObject({ resourceType: 'Schedule', id: 'sched-new', active: true });
    });

    it('should answer 409 SCHEDULE_OVERLAP and create nothing when the role already has an overlapping window', async () => {
      // Arrange
      harness.fhir.search.mockResolvedValue({
        entry: [
          {
            resource: {
              resourceType: 'Schedule',
              id: 'sched-old',
              extension: [{ url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '12:00', endTime: '15:00' }]) }],
            },
          },
        ],
      });

      // Act
      const response = await post(VALID_BODY).expect(409);

      // Assert
      expect(response.body).toMatchObject({ status: 409, errorCode: 'SCHEDULE_OVERLAP' });
      expect(harness.fhir.create).not.toHaveBeenCalled();
    });

    it('should answer 409 SCHEDULE_OVERLAP before searching HAPI when two windows of the body intersect', async () => {
      // Arrange
      const windows = [
        { dayOfWeek: 'MO', startTime: '09:00', endTime: '12:00' },
        { dayOfWeek: 'MO', startTime: '11:00', endTime: '14:00' },
      ];

      // Act
      const response = await post({ ...VALID_BODY, windows }).expect(409);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'SCHEDULE_OVERLAP' });
      expect(harness.fhir.search).not.toHaveBeenCalled();
    });

    it.each([
      ['a practitionerRoleId that is not a UUID', { ...VALID_BODY, practitionerRoleId: 'role-7' }],
      ['a roomId that is not a UUID', { ...VALID_BODY, roomId: 'room-204' }],
      ['a horizon that is not a date', { ...VALID_BODY, horizonFrom: 'tomorrow' }],
      ['no windows', { ...VALID_BODY, windows: [] }],
      ['a window on an unknown weekday', { ...VALID_BODY, windows: [{ dayOfWeek: 'XX', startTime: '09:00', endTime: '13:00' }] }],
      ['a window time outside 24 hours', { ...VALID_BODY, windows: [{ dayOfWeek: 'MO', startTime: '25:00', endTime: '26:00' }] }],
      ['a slot duration of 4 minutes', { ...VALID_BODY, slotDurationMin: 4 }],
      ['a slot duration of 121 minutes', { ...VALID_BODY, slotDurationMin: 121 }],
      ['a comment above 500 characters', { ...VALID_BODY, comment: 'x'.repeat(501) }],
    ])('should answer 400 VALIDATION_ERROR before HAPI is called when the body has %s', async (_label, body) => {
      // Act
      const response = await post(body).expect(400);

      // Assert
      expect(response.body).toMatchObject({ status: 400, errorCode: 'VALIDATION_ERROR' });
      expect(harness.fhir.search).not.toHaveBeenCalled();
      expect(harness.fhir.create).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/v1/admin/schedules/{id}', () => {
    const slotKey = CACHE_KEYS.SLOTS('sched-1', '2026-11-01', '2026-11-30:all');
    const busySlots = { entry: [{ resource: { resourceType: 'Slot', id: 'slot-1', status: 'busy' } }] };

    function remove(body?: object): request.Test {
      const call = request(harness.app.getHttpServer()).delete(`${SCHEDULES}/sched-1`).set('Authorization', TOKENS.admin);
      return body === undefined ? call : call.send(body);
    }

    beforeEach(() => {
      harness.store.entries.set(slotKey, '[]');
      harness.store.entries.set(CACHE_KEYS.DOCTOR_SLOTS_DAY('doc-1', '2026-11-02'), '[]');
    });

    it('should delete the Schedule and clear its slot caches when no busy slot exists and no body is sent', async () => {
      // Act
      await remove().expect(204);

      // Assert
      expect(harness.fhir.search).toHaveBeenCalledWith('Slot', { schedule: 'Schedule/sched-1', status: 'busy' });
      expect(harness.fhir.delete).toHaveBeenCalledWith('Schedule', 'sched-1');
      expect(harness.store.entries.has(slotKey)).toBe(false);
      expect(harness.store.entries.size).toBe(0);
    });

    it('should answer 409 SCHEDULE_IN_USE as problem+json and delete nothing when a busy slot exists', async () => {
      // Arrange
      harness.fhir.search.mockResolvedValue(busySlots);

      // Act
      const response = await remove({}).expect(409);

      // Assert
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({
        status: 409,
        errorCode: 'SCHEDULE_IN_USE',
        type: 'https://api.medcenter.by/errors/schedule-in-use',
        instance: `${SCHEDULES}/sched-1`,
      });
      expect(response.body.detail).toContain('SCHEDULE_IN_USE');
      expect(harness.fhir.delete).not.toHaveBeenCalled();
      expect(harness.store.entries.has(slotKey)).toBe(true);
    });

    it('should delete the Schedule when busy slots exist and the admin confirms with cascade', async () => {
      // Arrange
      harness.fhir.search.mockResolvedValue(busySlots);

      // Act
      await remove({ cascade: true }).expect(204);

      // Assert
      expect(harness.fhir.delete).toHaveBeenCalledWith('Schedule', 'sched-1');
      expect(harness.store.entries.size).toBe(0);
    });

    it('should answer 400 VALIDATION_ERROR before HAPI is called when cascade is not a boolean', async () => {
      // Act
      const response = await remove({ cascade: 'yes' }).expect(400);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(harness.fhir.search).not.toHaveBeenCalled();
    });

    it('should answer 404 NOT_FOUND and keep the caches when HAPI has no such schedule to delete', async () => {
      // Arrange
      harness.fhir.delete.mockRejectedValue(new FhirClientError('DELETE', 'http://hapi:8080/fhir/Schedule/sched-1', 404, '{}'));

      // Act
      const response = await remove({}).expect(404);

      // Assert
      expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
      expect(harness.store.entries.has(slotKey)).toBe(true);
    });
  });
});
