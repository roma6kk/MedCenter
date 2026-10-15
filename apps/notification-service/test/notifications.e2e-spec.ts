import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';
import request from 'supertest';

import { AppModule } from '../src/app/app.module';
import { DEDUP_STORE } from '../src/modules/notifications/deduplication.service';
import { applyE2eEnv } from './e2e-env';
import { bearer } from './e2e-tokens';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

const NOTIFICATIONS = '/api/v1/notifications';
const PATIENT_SCOPE = 'patient/*.read patient/*.write launch';
const patient = bearer({ role: 'PATIENT', scope: PATIENT_SCOPE, patient: 'pat-1', fhirUser: 'Patient/pat-1' });

function communication(id: string, recipient: string, status = 'in-progress'): FhirResource {
  return {
    resourceType: 'Communication',
    id,
    status,
    category: [{ text: 'appointment' }],
    recipient: [{ reference: recipient }],
    sent: '2026-11-02T09:00:00.000Z',
    payload: [{ contentString: 'Вы записаны на приём.' }],
  };
}

/**
 * Patient notifications (API §8.1-§8.3) through the real guard stack, validation
 * pipe and problem filter. Notifications are `Communication` resources in HAPI,
 * so every FHIR interaction is asserted on a scripted client.
 */
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;

  beforeEach(async () => {
    applyE2eEnv();
    fhir = {
      search: jest.fn().mockResolvedValue({ entry: [] }),
      read: jest.fn(),
      update: jest.fn().mockImplementation(async (_type, id, resource) => ({ ...resource, id })),
    } as unknown as jest.Mocked<FhirClient>;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FHIR_CLIENT)
      .useValue(fhir)
      .overrideProvider(DEDUP_STORE)
      .useValue({ claim: jest.fn(), complete: jest.fn(), delete: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  describe('GET /api/v1/notifications', () => {
    it('should list the own notifications newest first and map them to the view when a patient asks', async () => {
      // Arrange
      fhir.search.mockResolvedValue({ entry: [{ resource: communication('c-1', 'Patient/pat-1') }] });

      // Act
      const response = await request(app.getHttpServer()).get(NOTIFICATIONS).set('Authorization', patient).expect(200);

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('Communication', {
        recipient: 'Patient/pat-1',
        _sort: '-sent',
        _count: 20,
        _getpagesoffset: 0,
      });
      expect(response.body).toEqual([
        { id: 'c-1', category: 'appointment', text: 'Вы записаны на приём.', sent: '2026-11-02T09:00:00.000Z', read: false },
      ]);
    });

    it('should filter on the unread status and page the HAPI offset when unread, page and pageSize are given', async () => {
      // Act
      await request(app.getHttpServer()).get(`${NOTIFICATIONS}?unread=true&page=3&pageSize=5`).set('Authorization', patient).expect(200);

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('Communication', {
        recipient: 'Patient/pat-1',
        _sort: '-sent',
        _count: 5,
        _getpagesoffset: 10,
        status: 'in-progress',
      });
    });

    it('should ignore a patient query parameter when the token names the compartment', async () => {
      // Act — ADR-013: the patient comes from the token only.
      await request(app.getHttpServer()).get(`${NOTIFICATIONS}?patient=pat-2&recipient=Patient/pat-2`).set('Authorization', patient).expect(200);

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('Communication', expect.objectContaining({ recipient: 'Patient/pat-1' }));
    });

    it('should mark a completed Communication as read when it is listed', async () => {
      // Arrange
      fhir.search.mockResolvedValue({ entry: [{ resource: communication('c-1', 'Patient/pat-1', 'completed') }] });

      // Act
      const response = await request(app.getHttpServer()).get(NOTIFICATIONS).set('Authorization', patient).expect(200);

      // Assert
      expect(response.body[0]).toMatchObject({ id: 'c-1', read: true });
    });

    it.each([
      ['page=0', 'page=0'],
      ['page=abc', 'page=abc'],
      ['pageSize=0', 'pageSize=0'],
      ['pageSize=101', 'pageSize=101'],
      ['pageSize=1.5', 'pageSize=1.5'],
    ])('should answer 400 VALIDATION_ERROR before HAPI is called when the query has %s', async (_label, query) => {
      // Act
      const response = await request(app.getHttpServer()).get(`${NOTIFICATIONS}?${query}`).set('Authorization', patient).expect(400);

      // Assert
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 400, errorCode: 'VALIDATION_ERROR' });
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should answer 502 INTERNAL without the HAPI address when the FHIR server is down', async () => {
      // Arrange
      fhir.search.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Communication', 503, 'detail'));

      // Act
      const response = await request(app.getHttpServer()).get(NOTIFICATIONS).set('Authorization', patient).expect(502);

      // Assert
      expect(response.body).toMatchObject({ status: 502, errorCode: 'INTERNAL' });
      expect(JSON.stringify(response.body)).not.toContain('hapi:8080');
    });
  });

  describe('GET /api/v1/notifications/unread-count', () => {
    it('should count the unread notifications of the own compartment when a patient polls', async () => {
      // Arrange
      fhir.search.mockResolvedValue({ total: 4 });

      // Act
      const response = await request(app.getHttpServer()).get(`${NOTIFICATIONS}/unread-count`).set('Authorization', patient).expect(200);

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('Communication', { recipient: 'Patient/pat-1', status: 'in-progress', _summary: 'count' });
      expect(response.body).toEqual({ count: 4 });
    });

    it('should answer zero when HAPI reports no total', async () => {
      // Act
      const response = await request(app.getHttpServer()).get(`${NOTIFICATIONS}/unread-count`).set('Authorization', patient).expect(200);

      // Assert
      expect(response.body).toEqual({ count: 0 });
    });
  });

  describe('POST /api/v1/notifications/{id}/read', () => {
    it('should set the Communication to completed and answer 204 when the recipient marks it read', async () => {
      // Arrange
      fhir.read.mockResolvedValue(communication('c-1', 'Patient/pat-1'));

      // Act
      await request(app.getHttpServer()).post(`${NOTIFICATIONS}/c-1/read`).set('Authorization', patient).expect(204);

      // Assert
      expect(fhir.read).toHaveBeenCalledWith('Communication', 'c-1');
      expect(fhir.update).toHaveBeenCalledWith('Communication', 'c-1', {
        ...communication('c-1', 'Patient/pat-1'),
        status: 'completed',
      });
    });

    it('should answer 403 COMPARTMENT_VIOLATION and write nothing when the notification belongs to another patient', async () => {
      // Arrange
      fhir.read.mockResolvedValue(communication('c-9', 'Patient/pat-2'));

      // Act
      const response = await request(app.getHttpServer()).post(`${NOTIFICATIONS}/c-9/read`).set('Authorization', patient).expect(403);

      // Assert
      expect(response.body).toMatchObject({ status: 403, errorCode: 'COMPARTMENT_VIOLATION' });
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it('should answer 404 NOT_FOUND and write nothing when the notification does not exist', async () => {
      // Arrange
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Communication/ghost', 404, '{}'));

      // Act
      const response = await request(app.getHttpServer()).post(`${NOTIFICATIONS}/ghost/read`).set('Authorization', patient).expect(404);

      // Assert
      expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it.each([
      ['a comma-separated id', 'a,b'],
      ['a dot-only id', '..'],
      ['an id above 64 characters', 'x'.repeat(65)],
    ])('should answer 400 VALIDATION_ERROR before HAPI is called when the id is %s', async (_label, id) => {
      // Act
      const response = await request(app.getHttpServer())
        .post(`${NOTIFICATIONS}/${encodeURIComponent(id)}/read`)
        .set('Authorization', patient)
        .expect(400);

      // Assert
      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(fhir.read).not.toHaveBeenCalled();
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it('should answer 409 CONFLICT when HAPI rejects the status update as a stale version', async () => {
      // Arrange
      fhir.read.mockResolvedValue(communication('c-1', 'Patient/pat-1'));
      fhir.update.mockRejectedValue(new FhirClientError('PUT', 'http://hapi:8080/fhir/Communication/c-1', 412, '{}'));

      // Act
      const response = await request(app.getHttpServer()).post(`${NOTIFICATIONS}/c-1/read`).set('Authorization', patient).expect(409);

      // Assert
      expect(response.body).toMatchObject({ status: 409, errorCode: 'CONFLICT' });
    });
  });
});
