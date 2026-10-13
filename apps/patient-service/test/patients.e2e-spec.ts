import { FhirClientError, type FhirResource, type FhirSearchResult } from '@medcenter/fhir';
import request from 'supertest';

import { bootApp, type BootedApp } from './boot-app';

const patient: FhirResource = { resourceType: 'Patient', id: '9f2c', name: [{ family: 'Иванов', given: ['Иван'] }] };

const sharedAppointment: FhirResource = {
  resourceType: 'Appointment',
  id: 'apt-1',
  status: 'booked',
  participant: [{ actor: { reference: 'Patient/9f2c' } }, { actor: { reference: 'PractitionerRole/role-1' } }],
};

const relatedPerson: FhirResource = {
  resourceType: 'RelatedPerson',
  id: 'rp-1',
  patient: { reference: 'Patient/9f2c' },
  relationship: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'WIFE' }], text: 'Жена' }],
  name: [{ family: 'Иванова', given: ['Мария'] }],
};

function bundleOf(...resources: FhirResource[]): FhirSearchResult {
  return { total: resources.length, entry: resources.map((resource) => ({ resource })) };
}

/**
 * API §3.2–3.3 end to end: role/scope/compartment decisions through the real
 * guard stack and access policy; HAPI is mocked behind `FHIR_CLIENT`.
 */
describe('GET /api/v1/patients/{id}[/related] (e2e)', () => {
  let booted: BootedApp;

  beforeAll(async () => {
    booted = await bootApp();
  });

  afterAll(async () => {
    await booted?.close();
  });

  beforeEach(() => {
    booted.fhir.read.mockReset();
    booted.fhir.search.mockReset();
    booted.fhir.read.mockResolvedValue(patient);
    booted.fhir.search.mockImplementation(async (type) =>
      type === 'RelatedPerson' ? bundleOf(relatedPerson) : bundleOf(),
    );
  });

  const doctorToken = (): string =>
    booted.issuer.sign({ role: 'DOCTOR', scope: 'user/*.read user/*.write launch', fhirUser: 'PractitionerRole/role-1' });
  const adminToken = (): string => booted.issuer.sign({ role: 'ADMIN', scope: 'user/*.read user/*.write launch' });
  const patientToken = (): string =>
    booted.issuer.sign({ role: 'PATIENT', scope: 'patient/*.read launch', patient: '9f2c', fhirUser: 'Patient/9f2c' });

  const get = (path: string, token: string): request.Test =>
    request(booted.app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  it('should return the card when an admin reads any patient', async () => {
    const response = await get('/api/v1/patients/9f2c', adminToken()).expect(200);

    expect(response.body).toMatchObject({ id: '9f2c', lastName: 'Иванов', firstName: 'Иван' });
  });

  it('should return the card when the doctor shares an appointment with the patient', async () => {
    booted.fhir.search.mockImplementation(async (type) => (type === 'Appointment' ? bundleOf(sharedAppointment) : bundleOf()));

    const response = await get('/api/v1/patients/9f2c', doctorToken()).expect(200);

    expect(response.body).toMatchObject({ id: '9f2c' });
  });

  it('should answer 403 COMPARTMENT_VIOLATION when the doctor shares no care with the patient', async () => {
    const response = await get('/api/v1/patients/9f2c', doctorToken()).expect(403);

    expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
    expect(booted.fhir.read).not.toHaveBeenCalled();
  });

  it('should answer 403 COMPARTMENT_VIOLATION when a doctor token has no fhirUser', async () => {
    const token = booted.issuer.sign({ role: 'DOCTOR', scope: 'user/*.read' });

    const response = await get('/api/v1/patients/9f2c', token).expect(403);

    expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
  });

  it('should answer 403 COMPARTMENT_VIOLATION when a patient token reads another patient', async () => {
    const response = await get('/api/v1/patients/someone-else', patientToken()).expect(403);

    expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
    expect(booted.fhir.read).not.toHaveBeenCalled();
  });

  it('should answer 404 NOT_FOUND when an admin reads an unknown id', async () => {
    booted.fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Patient/404', 404));

    const response = await get('/api/v1/patients/404', adminToken()).expect(404);

    expect(response.body).toMatchObject({ errorCode: 'NOT_FOUND' });
  });

  it('should answer 400 VALIDATION_ERROR when the id is not a FHIR id', async () => {
    const response = await get('/api/v1/patients/9f2c,other', adminToken()).expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('should return a paginated RelatedPerson list when an admin lists trusted persons', async () => {
    const response = await get('/api/v1/patients/9f2c/related?page=1&pageSize=10', adminToken()).expect(200);

    expect(response.body).toEqual({
      items: [
        {
          id: 'rp-1',
          patientId: '9f2c',
          active: true,
          fullName: 'Иванова Мария',
          lastName: 'Иванова',
          firstName: 'Мария',
          relationship: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'WIFE', display: 'Жена' }],
          telecom: [],
        },
      ],
      meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
  });

  it('should translate page 3 of 10 into a FHIR _offset of 20 when listing trusted persons', async () => {
    await get('/api/v1/patients/9f2c/related?page=3&pageSize=10', adminToken()).expect(200);

    expect(booted.fhir.search).toHaveBeenCalledWith(
      'RelatedPerson',
      expect.objectContaining({ patient: 'Patient/9f2c', _count: 10, _offset: 20 }),
    );
  });

  it('should answer 400 VALIDATION_ERROR when page exceeds 1000', async () => {
    const response = await get('/api/v1/patients/9f2c/related?page=1001', adminToken()).expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('should answer 400 VALIDATION_ERROR when pageSize exceeds 100', async () => {
    const response = await get('/api/v1/patients/9f2c/related?pageSize=500', adminToken()).expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('should answer 403 COMPARTMENT_VIOLATION when a doctor lists trusted persons of an unrelated patient', async () => {
    const response = await get('/api/v1/patients/9f2c/related', doctorToken()).expect(403);

    expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
    expect(booted.fhir.search).not.toHaveBeenCalledWith('RelatedPerson', expect.anything());
  });
});
