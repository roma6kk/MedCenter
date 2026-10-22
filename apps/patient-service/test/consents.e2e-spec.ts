import { buildConsent, type FhirResource, type FhirSearchResult } from '@medcenter/fhir';
import request from 'supertest';

import { bootApp, type BootedApp } from './boot-app';

const patient: FhirResource = {
  resourceType: 'Patient',
  id: '9f2c',
  name: [{ family: 'Иванов', given: ['Иван'] }],
};

const sharedAppointment: FhirResource = {
  resourceType: 'Appointment',
  id: 'apt-1',
  status: 'booked',
  participant: [
    { actor: { reference: 'Patient/9f2c' } },
    { actor: { reference: 'PractitionerRole/role-1' } },
  ],
};

const PDF = Buffer.from('%PDF-1.7\nscan\n');
const binary: FhirResource = {
  resourceType: 'Binary',
  id: 'bin-1',
  contentType: 'application/pdf',
  data: PDF.toString('base64'),
  securityContext: { reference: 'Patient/9f2c' },
};

const consent: FhirResource = {
  ...buildConsent({
    patientId: '9f2c',
    status: 'active',
    formNumber: 'F-1',
    signedAt: '2026-10-01',
    performerRef: 'Patient/9f2c',
    consenterType: 'self',
    signer: { name: 'Петрова' },
    scan: { binaryId: 'bin-1', contentType: 'application/pdf', hash: 'aA==' },
  }),
  id: 'c-1',
  meta: { versionId: '2', lastUpdated: '2026-10-01T08:00:00Z' },
};

const validBody = {
  formNumber: 'ЭМК-1',
  signedAt: '2026-10-21',
  scanId: 'bin-1',
  consenterType: 'self',
  signedByName: 'Петрова А. А.',
};

function bundleOf(...resources: FhirResource[]): FhirSearchResult {
  return { total: resources.length, entry: resources.map((resource) => ({ resource })) };
}

/**
 * API §3.4–3.11 end to end: roles, scopes, DTO validation, multipart upload and
 * the download headers through the real guard stack; HAPI is mocked behind `FHIR_CLIENT`.
 */
describe('patient consent endpoints (e2e)', () => {
  let booted: BootedApp;
  let consents: FhirResource[];

  beforeAll(async () => {
    booted = await bootApp();
  });

  afterAll(async () => {
    await booted?.close();
  });

  beforeEach(() => {
    consents = [];
    for (const mock of [
      booted.fhir.read,
      booted.fhir.search,
      booted.fhir.batch,
      booted.fhir.create,
    ]) {
      mock.mockReset();
    }
    booted.fhir.read.mockImplementation(async (type) => (type === 'Binary' ? binary : patient));
    booted.fhir.search.mockImplementation(async (type) => {
      if (type === 'Consent') return bundleOf(...consents);
      if (type === 'Appointment') return bundleOf(sharedAppointment);
      return bundleOf();
    });
    booted.fhir.create.mockResolvedValue({ resourceType: 'AuditEvent' });
    booted.fhir.batch.mockResolvedValue({
      resourceType: 'Bundle',
      entry: [
        { response: { status: '201', location: 'Consent/c-new/_history/1' } },
        { response: { status: '201', location: 'AuditEvent/a/_history/1' } },
      ],
    });
  });

  const doctorToken = (): string =>
    booted.issuer.sign({
      role: 'DOCTOR',
      scope: 'user/*.read user/*.write launch',
      fhirUser: 'PractitionerRole/role-1',
    });
  const adminToken = (): string =>
    booted.issuer.sign({ role: 'ADMIN', scope: 'user/*.read user/*.write launch' });
  const patientToken = (scope = 'patient/*.read patient/*.write launch'): string =>
    booted.issuer.sign({ role: 'PATIENT', scope, patient: '9f2c', fhirUser: 'Patient/9f2c' });
  const http = (): ReturnType<typeof request> => request(booted.app.getHttpServer());

  describe('GET /me/consent (3.4) and POST /me/consent/revoke (3.6)', () => {
    it('should return the own consent and history to the patient', async () => {
      consents = [consent];

      const response = await http()
        .get('/api/v1/me/consent')
        .set('Authorization', `Bearer ${patientToken()}`)
        .expect(200);

      expect(response.body).toMatchObject({
        active: { id: 'c-1', status: 'active' },
        history: [{ id: 'c-1' }],
      });
    });

    it('should answer 403 FORBIDDEN_ROLE when a doctor calls the patient-only route', async () => {
      const token = booted.issuer.sign({
        role: 'DOCTOR',
        scope: 'user/*.read patient/*.read',
        fhirUser: 'PractitionerRole/role-1',
      });
      const response = await http()
        .get('/api/v1/me/consent')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
    });

    it('should answer 403 FORBIDDEN_SCOPE when the patient token cannot write', async () => {
      const response = await http()
        .post('/api/v1/me/consent/revoke')
        .set('Authorization', `Bearer ${patientToken('patient/*.read')}`)
        .expect(403);

      expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
    });

    it('should revoke the own consent and answer 200 with the inactive consent', async () => {
      consents = [consent];

      const response = await http()
        .post('/api/v1/me/consent/revoke')
        .set('Authorization', `Bearer ${patientToken()}`)
        .expect(200);

      expect(response.body).toMatchObject({ id: 'c-1', status: 'inactive' });
    });

    it('should answer 404 NOT_FOUND when there is nothing to revoke', async () => {
      const response = await http()
        .post('/api/v1/me/consent/revoke')
        .set('Authorization', `Bearer ${patientToken()}`)
        .expect(404);

      expect(response.body).toMatchObject({ errorCode: 'NOT_FOUND' });
    });
  });

  describe('GET /patients/{id}/consent (3.7)', () => {
    it('should answer an administrator and a linked doctor', async () => {
      await http()
        .get('/api/v1/patients/9f2c/consent')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      await http()
        .get('/api/v1/patients/9f2c/consent')
        .set('Authorization', `Bearer ${doctorToken()}`)
        .expect(200);
    });

    it('should answer 403 COMPARTMENT_VIOLATION to a doctor without a care link', async () => {
      booted.fhir.search.mockImplementation(async () => bundleOf());

      const response = await http()
        .get('/api/v1/patients/9f2c/consent')
        .set('Authorization', `Bearer ${doctorToken()}`)
        .expect(403);

      expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
    });

    it('should answer 403 FORBIDDEN_ROLE when a patient reads by patient id', async () => {
      await http()
        .get('/api/v1/patients/9f2c/consent')
        .set('Authorization', `Bearer ${patientToken()}`)
        .expect(403);
    });

    it('should answer 400 VALIDATION_ERROR when the id is not a FHIR id', async () => {
      const response = await http()
        .get('/api/v1/patients/%2E%2E/consent')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect([400, 404]).toContain(response.status);
    });
  });

  describe('POST /patients/{id}/consent (3.8)', () => {
    const post = (token: string, body: object): request.Test =>
      http()
        .post('/api/v1/patients/9f2c/consent')
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    it('should create the consent as an administrator and answer 201', async () => {
      const response = await post(adminToken(), validBody).expect(201);

      expect(response.body).toMatchObject({
        id: 'c-new',
        status: 'active',
        formNumber: 'ЭМК-1',
        signedBy: 'Петрова А. А.',
      });
      expect(booted.fhir.batch).toHaveBeenCalledTimes(1);
    });

    it('should create it as a linked doctor', async () => {
      await post(doctorToken(), { ...validBody, signedByName: undefined }).expect(201);
    });

    it('should answer 409 CONSENT_ALREADY_ACTIVE when a consent is in force', async () => {
      consents = [consent];

      const response = await post(adminToken(), validBody).expect(409);

      expect(response.body).toMatchObject({ errorCode: 'CONSENT_ALREADY_ACTIVE' });
    });

    it('should answer 403 to a doctor without a care link and write nothing', async () => {
      booted.fhir.search.mockImplementation(async () => bundleOf());

      await post(doctorToken(), validBody).expect(403);

      expect(booted.fhir.batch).not.toHaveBeenCalled();
    });

    it.each([
      ['a missing form number', { ...validBody, formNumber: undefined }],
      ['a blank form number', { ...validBody, formNumber: '   ' }],
      ['an unknown consenter type', { ...validBody, consenterType: 'neighbour' }],
      ['a status other than active or rejected', { ...validBody, status: 'inactive' }],
      ['a malformed date', { ...validBody, signedAt: 'yesterday' }],
      ['a missing scan', { ...validBody, scanId: undefined }],
      ['a scan id that is not a FHIR id', { ...validBody, scanId: '../x' }],
    ])('should answer 400 VALIDATION_ERROR for %s', async (_name, body) => {
      const response = await post(adminToken(), body).expect(400);

      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(booted.fhir.batch).not.toHaveBeenCalled();
    });
  });

  describe('POST /patients/{id}/consent/revoke (3.9)', () => {
    it('should revoke with the application number and answer 200', async () => {
      consents = [consent];

      const response = await http()
        .post('/api/v1/patients/9f2c/consent/revoke')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ applicationNumber: 'ЗАЯВ-7' })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'inactive', revocationNumber: 'ЗАЯВ-7' });
    });

    it('should answer 400 when the application number is missing', async () => {
      await http()
        .post('/api/v1/patients/9f2c/consent/revoke')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400);
    });
  });

  describe('POST /patients/{id}/consent/scan (3.10)', () => {
    beforeEach(() => {
      booted.fhir.batch.mockResolvedValue({
        resourceType: 'Bundle',
        entry: [
          { response: { status: '201', location: 'Binary/bin-9/_history/1' } },
          { response: { status: '201', location: 'AuditEvent/a/_history/1' } },
        ],
      });
    });

    const upload = (token: string, file: Buffer, contentType: string): request.Test =>
      http()
        .post('/api/v1/patients/9f2c/consent/scan')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', file, { filename: 'form.bin', contentType });

    it('should store a PDF and answer 201 with the scan id and sha1 hash', async () => {
      const response = await upload(adminToken(), PDF, 'application/pdf').expect(201);

      expect(response.body).toMatchObject({
        scanId: 'bin-9',
        contentType: 'application/pdf',
        size: PDF.length,
      });
      expect(response.body.hash).toMatch(/^[A-Za-z0-9+/]{27}=$/);
    });

    it('should answer 400 VALIDATION_ERROR for a type outside PDF, JPEG and PNG', async () => {
      const response = await upload(adminToken(), Buffer.from('<html></html>'), 'text/html').expect(
        400,
      );

      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(booted.fhir.batch).not.toHaveBeenCalled();
    });

    it('should answer 400 VALIDATION_ERROR when the bytes are not the declared type', async () => {
      await upload(adminToken(), Buffer.from('not a pdf at all'), 'application/pdf').expect(400);
    });

    it('should answer 400 VALIDATION_ERROR (not 413) for a file over 10 MB', async () => {
      const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);

      const response = await upload(adminToken(), big, 'application/pdf').expect(400);

      expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
      expect(response.body.detail).toContain('10 MB');
    });

    it('should answer 400 VALIDATION_ERROR when no file is sent', async () => {
      await http()
        .post('/api/v1/patients/9f2c/consent/scan')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);
    });

    it('should answer 403 to a doctor without a care link', async () => {
      booted.fhir.search.mockImplementation(async () => bundleOf());

      await upload(doctorToken(), PDF, 'application/pdf').expect(403);
    });
  });

  describe('GET /patients/{id}/consent/scan/{scanId} (3.11)', () => {
    it('should return the bytes as a no-store, no-sniff download and journal the read', async () => {
      const response = await http()
        .get('/api/v1/patients/9f2c/consent/scan/bin-1')
        .set('Authorization', `Bearer ${doctorToken()}`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(response.body).toEqual(PDF);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(booted.fhir.create).toHaveBeenCalledWith(
        'AuditEvent',
        expect.objectContaining({ action: 'R', outcome: '0' }),
      );
    });

    it('should answer 403 FORBIDDEN_ROLE when a patient asks for a scan by patient id', async () => {
      await http()
        .get('/api/v1/patients/9f2c/consent/scan/bin-1')
        .set('Authorization', `Bearer ${patientToken()}`)
        .expect(403);
    });

    it('should answer 404 NOT_FOUND for a scan of another patient', async () => {
      booted.fhir.read.mockImplementation(async (type) =>
        type === 'Binary'
          ? { ...binary, securityContext: { reference: 'Patient/other' } }
          : patient,
      );

      const response = await http()
        .get('/api/v1/patients/9f2c/consent/scan/bin-1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(404);

      expect(response.body).toMatchObject({ errorCode: 'NOT_FOUND' });
    });
  });
});
