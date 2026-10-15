import type { INestApplication } from '@nestjs/common';
import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';
import request from 'supertest';

import { bootWithFhir, createFhirStub, TOKENS } from './rooms-harness';

jest.mock('jose', () => jest.requireActual<typeof import('./e2e-tokens')>('./e2e-tokens').decodeOnlyJose());

const DOCTORS = '/api/v1/doctors';
const SNOMED = 'http://snomed.info/sct';

function practitioner(id: string, family: string, given: string, specialty?: string): FhirResource {
  return {
    resourceType: 'Practitioner',
    id,
    name: [{ family, given: [given] }],
    ...(specialty === undefined ? {} : { qualification: [{ code: { coding: [{ system: SNOMED, code: '419192003', display: specialty }] } }] }),
  };
}

function role(id: string, practitionerId: string): FhirResource {
  return { resourceType: 'PractitionerRole', id, practitioner: { reference: `Practitioner/${practitionerId}` } };
}

/**
 * Public doctor catalog (API §4.1, §4.2) over HTTP: the R4-valid HAPI queries,
 * the page envelope built from the Bundle, and how a failing HAPI is reported.
 */
describe('Doctors read side (e2e)', () => {
  let app: INestApplication;
  let fhir: jest.Mocked<FhirClient>;

  beforeEach(async () => {
    fhir = createFhirStub();
    app = await bootWithFhir(fhir);
  });

  afterEach(async () => {
    await app?.close();
  });

  describe('GET /api/v1/doctors/{id}', () => {
    it('should answer the doctor card with the display name and specialty when no token is sent', async () => {
      // Arrange
      fhir.read.mockResolvedValue(practitioner('doc-1', 'Иванова', 'Мария', 'Терапевт'));

      // Act
      const response = await request(app.getHttpServer()).get(`${DOCTORS}/doc-1`).expect(200);

      // Assert
      expect(fhir.read).toHaveBeenCalledWith('Practitioner', 'doc-1');
      expect(response.body).toMatchObject({
        id: 'doc-1',
        name: 'Мария Иванова',
        firstName: 'Мария',
        lastName: 'Иванова',
        specialty: 'Терапевт',
      });
    });

    it('should answer 200 when a patient token is attached to the public route', async () => {
      // Arrange
      fhir.read.mockResolvedValue(practitioner('doc-1', 'Иванова', 'Мария'));

      // Act
      await request(app.getHttpServer()).get(`${DOCTORS}/doc-1`).set('Authorization', TOKENS.patient).expect(200);

      // Assert
      expect(fhir.read).toHaveBeenCalledTimes(1);
    });

    it('should answer 404 NOT_FOUND as problem+json when the doctor does not exist', async () => {
      // Arrange
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Practitioner/ghost', 404, '{}'));

      // Act
      const response = await request(app.getHttpServer()).get(`${DOCTORS}/ghost`).expect(404);

      // Assert
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND', instance: `${DOCTORS}/ghost` });
      expect(response.body.requestId).toBeDefined();
    });

    it('should answer 504 INTERNAL when HAPI times out', async () => {
      // Arrange
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Practitioner/doc-1', undefined, undefined, { timedOut: true }));

      // Act
      const response = await request(app.getHttpServer()).get(`${DOCTORS}/doc-1`).expect(504);

      // Assert
      expect(response.body).toMatchObject({ status: 504, errorCode: 'INTERNAL' });
    });
  });

  describe('GET /api/v1/doctors with a role filter', () => {
    it('should list the included practitioners and report the role total when a specialty is given', async () => {
      // Arrange
      fhir.search.mockResolvedValue({
        total: 7,
        entry: [
          { resource: role('role-1', 'doc-1') },
          { resource: practitioner('doc-1', 'Иванова', 'Мария', 'Терапевт') },
          { resource: role('role-2', 'doc-2') },
          { resource: practitioner('doc-2', 'Козлов', 'Пётр', 'Терапевт') },
        ],
      });

      // Act
      const response = await request(app.getHttpServer()).get(`${DOCTORS}?specialty=419192003&page=2&pageSize=2`).expect(200);

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('PractitionerRole', {
        specialty: '419192003',
        _include: 'PractitionerRole:practitioner',
        _count: 2,
        _offset: 2,
        _total: 'accurate',
      });
      expect(response.body.items.map((item: { id: string }) => item.id)).toEqual(['doc-1', 'doc-2']);
      expect(response.body.meta).toEqual({ page: 2, pageSize: 2, totalItems: 7, totalPages: 4 });
    });

    it('should list a practitioner once when two roles on the page belong to the same doctor', async () => {
      // Arrange
      fhir.search.mockResolvedValue({
        total: 2,
        entry: [
          { resource: role('role-1', 'doc-1') },
          { resource: role('role-2', 'doc-1') },
          { resource: practitioner('doc-1', 'Иванова', 'Мария') },
        ],
      });

      // Act
      const response = await request(app.getHttpServer()).get(`${DOCTORS}?serviceId=svc-1`).expect(200);

      // Assert
      expect(response.body.items).toHaveLength(1);
      expect(fhir.search).toHaveBeenCalledWith('PractitionerRole', expect.objectContaining({ service: 'HealthcareService/svc-1' }));
    });

    it('should answer an empty page when no role matches', async () => {
      // Act
      const response = await request(app.getHttpServer()).get(`${DOCTORS}?specialty=none`).expect(200);

      // Assert
      expect(response.body).toEqual({ items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    });

    it('should fall back to the plain Practitioner search when the specialty is blank', async () => {
      // Act
      await request(app.getHttpServer()).get(`${DOCTORS}?specialty=%20%20`).expect(200);

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('Practitioner', { _count: 20, _offset: 0, _total: 'accurate' });
    });

    it('should never ask HAPI for a parameter R4 does not define when every filter is combined', async () => {
      // Act
      await request(app.getHttpServer()).get(`${DOCTORS}?specialty=419192003&serviceId=svc-1&search=Иван`).expect(200);

      // Assert
      const [, params] = fhir.search.mock.calls[0] ?? [];
      expect(Object.keys(params ?? {})).not.toContain('qualification-code');
      expect(Object.keys(params ?? {})).toEqual(expect.arrayContaining(['service', 'specialty', 'practitioner.name']));
    });
  });

  describe('GET /api/v1/doctors when HAPI fails', () => {
    it('should answer 502 INTERNAL without the HAPI address when the FHIR server is down', async () => {
      // Arrange
      fhir.search.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Practitioner', 503, 'upstream detail'));

      // Act
      const response = await request(app.getHttpServer()).get(DOCTORS).expect(502);

      // Assert
      expect(response.body).toMatchObject({ status: 502, errorCode: 'INTERNAL' });
      expect(JSON.stringify(response.body)).not.toMatch(/hapi:8080|upstream detail/);
    });

    it('should answer 500 INTERNAL without the OperationOutcome when HAPI rejects a search this service built', async () => {
      // Arrange
      fhir.search.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Practitioner', 400, 'HAPI-0524 unknown parameter'));

      // Act
      const response = await request(app.getHttpServer()).get(DOCTORS).expect(500);

      // Assert
      expect(response.body).toMatchObject({ status: 500, errorCode: 'INTERNAL' });
      expect(JSON.stringify(response.body)).not.toContain('HAPI-0524');
    });

    it('should answer 500 INTERNAL when the FHIR client throws something that is not an HTTP error', async () => {
      // Arrange
      fhir.search.mockRejectedValue(new TypeError('Cannot read properties of undefined'));

      // Act
      const response = await request(app.getHttpServer()).get(DOCTORS).expect(500);

      // Assert
      expect(response.body).toMatchObject({ status: 500, errorCode: 'INTERNAL', detail: 'Внутренняя ошибка сервера' });
      expect(JSON.stringify(response.body)).not.toContain('undefined');
    });
  });
});
