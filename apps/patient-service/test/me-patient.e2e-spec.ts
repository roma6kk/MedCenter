import type { FhirResource } from '@medcenter/fhir';
import { FhirClientError } from '@medcenter/fhir';
import request from 'supertest';

import { bootApp, type BootedApp } from './boot-app';

const ME_PATIENT = '/api/v1/me/patient';

const patient: FhirResource = {
  resourceType: 'Patient',
  id: '9f2c',
  name: [{ use: 'official', family: 'Иванов', given: ['Иван', 'Петрович'] }],
  birthDate: '1990-05-12',
  gender: 'male',
  telecom: [{ system: 'email', value: 'ivanov@example.by' }],
};

/**
 * API §3.1 `GET /api/v1/me/patient` end to end: real JWT verification against
 * a JWKS, real guards and filter; only HAPI is mocked (`FHIR_CLIENT`).
 */
describe('GET /api/v1/me/patient (e2e)', () => {
  let booted: BootedApp;

  beforeAll(async () => {
    booted = await bootApp();
  });

  afterAll(async () => {
    await booted?.close();
  });

  beforeEach(() => {
    booted.fhir.read.mockReset();
    booted.fhir.read.mockResolvedValue(patient);
  });

  function patientToken(patientClaim = '9f2c', scope = 'patient/*.read patient/*.write launch'): string {
    return booted.issuer.sign({ role: 'PATIENT', scope, patient: patientClaim, fhirUser: `Patient/${patientClaim}` });
  }

  it('should return the token patient profile when a patient calls with patient/*.read', async () => {
    const response = await request(booted.app.getHttpServer())
      .get(ME_PATIENT)
      .set('Authorization', `Bearer ${patientToken()}`)
      .expect(200);

    expect(response.body).toEqual({
      id: '9f2c',
      active: true,
      fullName: 'Иванов Иван Петрович',
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: 'Петрович',
      birthDate: '1990-05-12',
      gender: 'male',
      telecom: [{ system: 'email', value: 'ivanov@example.by' }],
      identifiers: [],
    });
    expect(booted.fhir.read).toHaveBeenCalledWith('Patient', '9f2c');
  });

  it('should ignore a patient query parameter when a patient-scoped token is used', async () => {
    await request(booted.app.getHttpServer())
      .get(`${ME_PATIENT}?patient=someone-else`)
      .set('Authorization', `Bearer ${patientToken()}`)
      .expect(200);

    expect(booted.fhir.read).toHaveBeenCalledWith('Patient', '9f2c');
    expect(booted.fhir.read).not.toHaveBeenCalledWith('Patient', 'someone-else');
  });

  it('should answer 403 FORBIDDEN_SCOPE when the token lacks patient/*.read', async () => {
    const response = await request(booted.app.getHttpServer())
      .get(ME_PATIENT)
      .set('Authorization', `Bearer ${patientToken('9f2c', 'patient/*.write')}`)
      .expect(403);

    expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
  });

  it('should answer 403 FORBIDDEN_ROLE when a doctor calls the patient-only endpoint', async () => {
    const token = booted.issuer.sign({ role: 'DOCTOR', scope: 'user/*.read patient/*.read', fhirUser: 'PractitionerRole/role-1' });

    const response = await request(booted.app.getHttpServer())
      .get(ME_PATIENT)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
  });

  it('should answer 403 COMPARTMENT_VIOLATION when the patient token carries no patient claim', async () => {
    const token = booted.issuer.sign({ role: 'PATIENT', scope: 'patient/*.read' });

    const response = await request(booted.app.getHttpServer())
      .get(ME_PATIENT)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
    expect(booted.fhir.read).not.toHaveBeenCalled();
  });

  it('should answer 404 NOT_FOUND problem+json when HAPI has no such Patient', async () => {
    booted.fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi:8080/fhir/Patient/9f2c', 404));

    const response = await request(booted.app.getHttpServer())
      .get(ME_PATIENT)
      .set('Authorization', `Bearer ${patientToken()}`)
      .expect(404);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ status: 404, errorCode: 'NOT_FOUND' });
    expect(JSON.stringify(response.body)).not.toContain('hapi:8080');
  });

  /** The request must be refused with 401 UNAUTHENTICATED before HAPI is touched. */
  it('should refuse the request without reading FHIR when the token signature is forged', async () => {
    const [header, payload] = patientToken().split('.');
    const forged = `${header}.${payload}.${Buffer.from('forged').toString('base64url')}`;

    const response = await request(booted.app.getHttpServer())
      .get(ME_PATIENT)
      .set('Authorization', `Bearer ${forged}`);

    expect(response.status).toBe(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
    expect(response.body).not.toHaveProperty('id');
    expect(booted.fhir.read).not.toHaveBeenCalled();
  });
});
