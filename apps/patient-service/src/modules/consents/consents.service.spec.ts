import { createHash } from 'node:crypto';

import { CONSENT_CODE_SYSTEMS, MEDCENTER_EXT } from '@medcenter/terminology';
import {
  buildConsent,
  FhirClientError,
  PatientReadAudit,
  type FhirClient,
  type FhirResource,
} from '@medcenter/fhir';

import {
  adminClaims,
  bundleOf,
  createFhirClientMock,
  doctorClaims,
  errorPayloadOf,
  errorStatusOf,
  patientClaims,
  patientResource,
  PATIENT_ID,
  ROLE_ID,
  sharedAppointment,
} from '../../__tests__/patient-service.fixtures';
import { PatientAccessService } from '../access/patient-access.service';
import { ConsentsService } from './consents.service';
import type { UploadedScan } from './consent-scan';

const PDF_BYTES = Buffer.from('%PDF-1.7\nscan of the paper form\n');
const PDF_HASH = createHash('sha1').update(PDF_BYTES).digest('base64');

const scanBinary: FhirResource = {
  resourceType: 'Binary',
  id: 'bin-1',
  contentType: 'application/pdf',
  data: PDF_BYTES.toString('base64'),
  securityContext: { reference: `Patient/${PATIENT_ID}` },
};

const relatedPerson: FhirResource = {
  resourceType: 'RelatedPerson',
  id: 'rp-1',
  patient: { reference: `Patient/${PATIENT_ID}` },
};

function storedConsent(overrides: Record<string, unknown> = {}): FhirResource {
  return {
    ...buildConsent({
      patientId: PATIENT_ID,
      status: 'active',
      formNumber: 'F-1',
      signedAt: '2026-10-01',
      performerRef: `Patient/${PATIENT_ID}`,
      consenterType: 'self',
      signer: { name: 'Петрова' },
      scan: { binaryId: 'bin-1', contentType: 'application/pdf', hash: PDF_HASH },
    }),
    id: 'c-1',
    meta: { versionId: '3', lastUpdated: '2026-10-01T08:00:00Z' },
    ...overrides,
  };
}

const createDto = {
  formNumber: 'ЭМК-2026-000123',
  signedAt: '2026-10-21',
  scanId: 'bin-1',
  consenterType: 'self' as const,
  signedByName: 'Петрова А. А.',
};

function createdBundle(resourceType: string, id: string): FhirResource {
  return {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: [
      { response: { status: '201 Created', location: `${resourceType}/${id}/_history/1` } },
      { response: { status: '201 Created', location: 'AuditEvent/a-1/_history/1' } },
    ],
  };
}

/** What the single transaction Bundle of a write contained. */
function writesOf(
  fhir: jest.Mocked<FhirClient>,
): ReadonlyArray<{ resource: FhirResource; request: Record<string, string>; fullUrl?: string }> {
  expect(fhir.batch).toHaveBeenCalledTimes(1);
  return (fhir.batch.mock.calls[0]?.[0]['entry'] ?? []) as never;
}

describe('ConsentsService', () => {
  let fhir: jest.Mocked<FhirClient>;
  let service: ConsentsService;
  let consents: FhirResource[];
  let binary: FhirResource;

  beforeEach(() => {
    fhir = createFhirClientMock();
    consents = [];
    binary = scanBinary;
    fhir.read.mockImplementation(async (type) => {
      if (type === 'Patient') return patientResource;
      if (type === 'RelatedPerson') return relatedPerson;
      if (type === 'Binary') return binary;
      throw new FhirClientError('GET', `http://hapi/fhir/${type}`, 404);
    });
    fhir.search.mockImplementation(async (type) => {
      if (type === 'Consent') return bundleOf(...consents);
      if (type === 'Appointment') return bundleOf(sharedAppointment);
      return bundleOf();
    });
    fhir.batch.mockResolvedValue(createdBundle('Consent', 'c-new'));
    service = new ConsentsService(fhir, new PatientAccessService(fhir), new PatientReadAudit(fhir));
  });

  describe('getMine (3.4)', () => {
    it('should answer the consent in force and the whole history of the token patient', async () => {
      consents = [storedConsent(), storedConsent({ id: 'c-0', status: 'inactive' })];

      const result = await service.getMine(patientClaims);

      expect(result.active).toMatchObject({ id: 'c-1', status: 'active' });
      expect(result.history.map((item) => item.id)).toEqual(['c-1', 'c-0']);
      expect(fhir.search).toHaveBeenCalledWith(
        'Consent',
        expect.objectContaining({ patient: `Patient/${PATIENT_ID}` }),
      );
    });

    it('should answer active null when every consent was revoked', async () => {
      consents = [storedConsent({ status: 'inactive' })];

      expect(await service.getMine(patientClaims)).toMatchObject({
        active: null,
        history: [{ id: 'c-1' }],
      });
    });

    it('should not journal a patient reading their own consent', async () => {
      await service.getMine(patientClaims);

      expect(fhir.create).not.toHaveBeenCalled();
    });
  });

  describe('getForPatient (3.7)', () => {
    it('should journal a doctor read as a search-type read of the patient', async () => {
      consents = [storedConsent()];

      const result = await service.getForPatient(PATIENT_ID, doctorClaims, 'req-1');

      expect(result.active).toMatchObject({ id: 'c-1' });
      expect(fhir.create).toHaveBeenCalledWith(
        'AuditEvent',
        expect.objectContaining({
          action: 'E',
          outcome: '0',
          subtype: [expect.objectContaining({ code: 'search-type' })],
        }),
      );
    });

    it('should journal an administrator read too', async () => {
      await service.getForPatient(PATIENT_ID, adminClaims, 'req-1');

      expect(fhir.create).toHaveBeenCalledTimes(1);
    });

    it('should refuse a doctor without a care link, journal the refusal and read no consent', async () => {
      fhir.search.mockImplementation(async () => bundleOf());

      expect(await errorStatusOf(service.getForPatient(PATIENT_ID, doctorClaims))).toBe(403);
      expect(fhir.create).toHaveBeenCalledWith(
        'AuditEvent',
        expect.objectContaining({ outcome: '4' }),
      );
      expect(fhir.search).not.toHaveBeenCalledWith('Consent', expect.anything());
    });

    it('should answer 404 when the patient does not exist', async () => {
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/Patient/x', 404));

      expect(await errorStatusOf(service.getForPatient(PATIENT_ID, adminClaims))).toBe(404);
    });
  });

  describe('create (3.8)', () => {
    it('should write the Consent and its create AuditEvent in one transaction as an administrator', async () => {
      const response = await service.create(PATIENT_ID, createDto, adminClaims, 'req-7');

      const [consentWrite, auditWrite] = writesOf(fhir);
      expect(consentWrite?.request).toEqual({ method: 'POST', url: 'Consent' });
      expect(consentWrite?.resource).toMatchObject({
        status: 'active',
        patient: { reference: `Patient/${PATIENT_ID}` },
        performer: [{ reference: `Patient/${PATIENT_ID}` }],
        dateTime: '2026-10-21',
        identifier: [{ system: CONSENT_CODE_SYSTEMS.FORM_NUMBER, value: 'ЭМК-2026-000123' }],
        sourceAttachment: { url: 'Binary/bin-1', contentType: 'application/pdf', hash: PDF_HASH },
        note: [expect.objectContaining({ authorString: 'Петрова А. А.' })],
      });
      expect(auditWrite?.resource).toMatchObject({
        resourceType: 'AuditEvent',
        action: 'C',
        agent: [{ who: { identifier: { value: 'user-a' } } }],
        entity: [
          { what: { reference: consentWrite?.fullUrl } },
          { what: { reference: `Patient/${PATIENT_ID}` } },
          { what: { identifier: { value: 'req-7' } } },
        ],
      });
      expect(response).toMatchObject({
        id: 'c-new',
        status: 'active',
        formNumber: 'ЭМК-2026-000123',
        signedBy: 'Петрова А. А.',
      });
    });

    it('should recompute the scan hash from the stored bytes instead of trusting the client', async () => {
      await service.create(PATIENT_ID, createDto, adminClaims);

      expect(writesOf(fhir)[0]?.resource['sourceAttachment']).toMatchObject({ hash: PDF_HASH });
    });

    it('should let a linked doctor enter the consent and sign it as their PractitionerRole', async () => {
      await service.create(PATIENT_ID, { ...createDto, signedByName: undefined }, doctorClaims);

      expect(writesOf(fhir)[0]?.resource['note']).toEqual([
        expect.objectContaining({ authorReference: { reference: `PractitionerRole/${ROLE_ID}` } }),
      ]);
    });

    it('should record a written refusal as rejected', async () => {
      await service.create(PATIENT_ID, { ...createDto, status: 'rejected' }, adminClaims);

      expect(writesOf(fhir)[0]?.resource).toMatchObject({
        status: 'rejected',
        provision: { type: 'deny' },
      });
    });

    it('should answer 409 CONSENT_ALREADY_ACTIVE and write nothing when a consent is already in force', async () => {
      consents = [storedConsent()];

      expect(
        await errorPayloadOf(service.create(PATIENT_ID, createDto, adminClaims)),
      ).toMatchObject({
        errorCode: 'CONSENT_ALREADY_ACTIVE',
      });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should answer 409 CONSENT_ALREADY_ACTIVE for a refusal while a consent is in force', async () => {
      consents = [storedConsent()];

      expect(
        await errorStatusOf(
          service.create(PATIENT_ID, { ...createDto, status: 'rejected' }, adminClaims),
        ),
      ).toBe(409);
    });

    it('should accept a new consent after the previous one was revoked', async () => {
      consents = [storedConsent({ status: 'inactive' })];

      await expect(service.create(PATIENT_ID, createDto, adminClaims)).resolves.toMatchObject({
        status: 'active',
      });
    });

    it('should refuse a doctor without a care link before reading or writing anything', async () => {
      fhir.search.mockImplementation(async () => bundleOf());

      expect(
        await errorPayloadOf(service.create(PATIENT_ID, createDto, doctorClaims)),
      ).toMatchObject({
        errorCode: 'COMPARTMENT_VIOLATION',
      });
      expect(fhir.batch).not.toHaveBeenCalled();
      expect(fhir.read).not.toHaveBeenCalled();
    });

    it('should require the signer name from an administrator, who has no PractitionerRole', async () => {
      const payload = await errorPayloadOf(
        service.create(PATIENT_ID, { ...createDto, signedByName: undefined }, adminClaims),
      );

      expect(payload).toMatchObject({
        errorCode: 'VALIDATION_ERROR',
        details: [{ field: 'signedByName' }],
      });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should refuse a scan that does not exist', async () => {
      fhir.read.mockImplementation(async (type) => {
        if (type === 'Patient') return patientResource;
        throw new FhirClientError('GET', 'http://hapi/fhir/Binary/bin-1', 404);
      });

      expect(
        await errorPayloadOf(service.create(PATIENT_ID, createDto, adminClaims)),
      ).toMatchObject({
        errorCode: 'VALIDATION_ERROR',
        details: [{ field: 'scanId' }],
      });
    });

    it('should refuse a scan uploaded for another patient', async () => {
      binary = { ...scanBinary, securityContext: { reference: 'Patient/someone-else' } };

      expect(
        await errorPayloadOf(service.create(PATIENT_ID, createDto, adminClaims)),
      ).toMatchObject({
        errorCode: 'VALIDATION_ERROR',
        details: [{ field: 'scanId' }],
      });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should require a RelatedPerson of the patient when someone else signed', async () => {
      const dto = {
        ...createDto,
        consenterType: 'guardian' as const,
        representativeDocument: 'Решение опеки № 5',
      };

      expect(await errorPayloadOf(service.create(PATIENT_ID, dto, adminClaims))).toMatchObject({
        details: [{ field: 'relatedPersonId' }],
      });
    });

    it('should require the document of authority when someone else signed', async () => {
      const dto = { ...createDto, consenterType: 'relative' as const, relatedPersonId: 'rp-1' };

      expect(await errorPayloadOf(service.create(PATIENT_ID, dto, adminClaims))).toMatchObject({
        details: [{ field: 'representativeDocument' }],
      });
    });

    it('should record the representative as performer with the consenter type and the document', async () => {
      const dto = {
        ...createDto,
        consenterType: 'guardian' as const,
        relatedPersonId: 'rp-1',
        representativeDocument: 'Решение опеки № 5',
      };

      await service.create(PATIENT_ID, dto, adminClaims);

      const consent = writesOf(fhir)[0]?.resource;
      expect(consent?.['performer']).toEqual([{ reference: 'RelatedPerson/rp-1' }]);
      expect(consent?.['extension']).toEqual(
        expect.arrayContaining([
          { url: MEDCENTER_EXT.CONSENT_CONSENTER_TYPE, valueCode: 'guardian' },
          { url: MEDCENTER_EXT.CONSENT_REPRESENTATIVE_DOCUMENT, valueString: 'Решение опеки № 5' },
        ]),
      );
    });

    it('should refuse a RelatedPerson that belongs to another patient', async () => {
      fhir.read.mockImplementation(async (type) => {
        if (type === 'RelatedPerson')
          return { ...relatedPerson, patient: { reference: 'Patient/someone-else' } };
        if (type === 'Patient') return patientResource;
        return binary;
      });
      const dto = {
        ...createDto,
        consenterType: 'guardian' as const,
        relatedPersonId: 'rp-1',
        representativeDocument: 'Док',
      };

      expect(await errorPayloadOf(service.create(PATIENT_ID, dto, adminClaims))).toMatchObject({
        details: [{ field: 'relatedPersonId' }],
      });
    });

    it('should refuse a related person given with a self-signed form', async () => {
      expect(
        await errorPayloadOf(
          service.create(PATIENT_ID, { ...createDto, relatedPersonId: 'rp-1' }, adminClaims),
        ),
      ).toMatchObject({
        details: [{ field: 'relatedPersonId' }],
      });
    });

    it('should refuse a signing date in the future', async () => {
      const tomorrow = new Date(Date.now() + 72 * 3600_000).toISOString().slice(0, 10);

      expect(
        await errorPayloadOf(
          service.create(PATIENT_ID, { ...createDto, signedAt: tomorrow }, adminClaims),
        ),
      ).toMatchObject({
        details: [{ field: 'signedAt' }],
      });
    });

    it('should answer 409 CONFLICT when HAPI rejects the transaction as a concurrent change', async () => {
      fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir', 409));

      expect(await errorStatusOf(service.create(PATIENT_ID, createDto, adminClaims))).toBe(409);
    });
  });

  describe('revoke (3.9) and revokeMine (3.6)', () => {
    beforeEach(() => {
      consents = [storedConsent()];
      fhir.batch.mockResolvedValue({
        resourceType: 'Bundle',
        entry: [{ response: { status: '200 OK', location: 'Consent/c-1/_history/4' } }],
      });
    });

    it('should close the consent with the application number and write an update AuditEvent in the same transaction', async () => {
      const response = await service.revoke(
        PATIENT_ID,
        { applicationNumber: 'ЗАЯВ-7', revokedAt: '2026-10-22' },
        adminClaims,
        'req-9',
      );

      const [consentWrite, auditWrite] = writesOf(fhir);
      expect(consentWrite?.request).toEqual({
        method: 'PUT',
        url: 'Consent/c-1',
        ifMatch: 'W/"3"',
      });
      expect(consentWrite?.resource).toMatchObject({
        id: 'c-1',
        status: 'inactive',
        provision: { period: { start: '2026-10-01', end: '2026-10-22' } },
      });
      expect(auditWrite?.resource).toMatchObject({
        action: 'U',
        entity: [
          { what: { reference: 'Consent/c-1' } },
          { what: { reference: `Patient/${PATIENT_ID}` } },
          expect.anything(),
        ],
      });
      expect(response).toMatchObject({ id: 'c-1', status: 'inactive', revocationNumber: 'ЗАЯВ-7' });
    });

    it('should default the revocation moment to now', async () => {
      await service.revoke(PATIENT_ID, { applicationNumber: 'ЗАЯВ-7' }, adminClaims);

      const end = (writesOf(fhir)[0]?.resource['provision'] as { period: { end: string } }).period
        .end;
      expect(Math.abs(Date.now() - new Date(end).getTime())).toBeLessThan(5000);
    });

    it('should answer 404 NOT_FOUND when there is no consent in force', async () => {
      consents = [storedConsent({ status: 'inactive' })];

      expect(
        await errorPayloadOf(service.revoke(PATIENT_ID, { applicationNumber: 'X' }, adminClaims)),
      ).toMatchObject({ errorCode: 'NOT_FOUND' });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should refuse a revocation dated before the consent began', async () => {
      expect(
        await errorPayloadOf(
          service.revoke(
            PATIENT_ID,
            { applicationNumber: 'X', revokedAt: '2026-09-01' },
            adminClaims,
          ),
        ),
      ).toMatchObject({
        details: [{ field: 'revokedAt' }],
      });
    });

    it('should refuse a doctor without a care link', async () => {
      fhir.search.mockImplementation(async (type) =>
        type === 'Consent' ? bundleOf(...consents) : bundleOf(),
      );

      expect(
        await errorPayloadOf(service.revoke(PATIENT_ID, { applicationNumber: 'X' }, doctorClaims)),
      ).toMatchObject({
        errorCode: 'COMPARTMENT_VIOLATION',
      });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should let the patient revoke their own consent from the token, without an application number', async () => {
      const response = await service.revokeMine(patientClaims, 'req-3');

      const [consentWrite, auditWrite] = writesOf(fhir);
      expect(consentWrite?.resource).toMatchObject({ status: 'inactive' });
      expect(JSON.stringify(consentWrite?.resource['extension'])).not.toContain(
        'revocation-number',
      );
      expect(auditWrite?.resource).toMatchObject({
        agent: [{ who: { identifier: { value: 'user-p' } } }],
      });
      expect(response.status).toBe('inactive');
      expect(fhir.search).toHaveBeenCalledWith(
        'Consent',
        expect.objectContaining({ patient: `Patient/${PATIENT_ID}` }),
      );
    });

    it('should answer 404 when the patient has nothing to revoke', async () => {
      consents = [];

      expect(await errorStatusOf(service.revokeMine(patientClaims))).toBe(404);
    });
  });

  describe('uploadScan (3.10)', () => {
    const upload: UploadedScan = {
      buffer: PDF_BYTES,
      mimetype: 'application/pdf',
      size: PDF_BYTES.length,
      originalname: 'form.pdf',
    };

    beforeEach(() => {
      fhir.batch.mockResolvedValue(createdBundle('Binary', 'bin-9'));
    });

    it('should store the Binary tied to the patient and journal its creation in the same transaction', async () => {
      const response = await service.uploadScan(PATIENT_ID, upload, adminClaims, 'req-5');

      const [binaryWrite, auditWrite] = writesOf(fhir);
      expect(binaryWrite?.resource).toEqual({
        resourceType: 'Binary',
        contentType: 'application/pdf',
        data: PDF_BYTES.toString('base64'),
        securityContext: { reference: `Patient/${PATIENT_ID}` },
      });
      expect(auditWrite?.resource).toMatchObject({
        action: 'C',
        entity: [
          { what: { reference: binaryWrite?.fullUrl } },
          expect.anything(),
          expect.anything(),
        ],
      });
      expect(response).toEqual({
        scanId: 'bin-9',
        contentType: 'application/pdf',
        size: PDF_BYTES.length,
        hash: PDF_HASH,
      });
    });

    it('should refuse an invalid file before touching HAPI', async () => {
      const bad: UploadedScan = { ...upload, buffer: Buffer.from('<html>'), size: 6 };

      expect(await errorPayloadOf(service.uploadScan(PATIENT_ID, bad, adminClaims))).toMatchObject({
        errorCode: 'VALIDATION_ERROR',
      });
      expect(fhir.read).not.toHaveBeenCalled();
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should refuse a doctor without a care link', async () => {
      fhir.search.mockImplementation(async () => bundleOf());

      expect(await errorStatusOf(service.uploadScan(PATIENT_ID, upload, doctorClaims))).toBe(403);
      expect(fhir.batch).not.toHaveBeenCalled();
    });
  });

  describe('readScan (3.11)', () => {
    it('should return the bytes and journal the read of the Binary before answering', async () => {
      const scan = await service.readScan(PATIENT_ID, 'bin-1', doctorClaims, 'req-4');

      expect(scan).toEqual({ contentType: 'application/pdf', data: PDF_BYTES });
      expect(fhir.create).toHaveBeenCalledWith(
        'AuditEvent',
        expect.objectContaining({
          action: 'R',
          outcome: '0',
          entity: [
            { what: { reference: 'Binary/bin-1' } },
            expect.objectContaining({ what: { reference: `Patient/${PATIENT_ID}` } }),
            expect.anything(),
          ],
        }),
      );
    });

    it('should journal an administrator download as well', async () => {
      await service.readScan(PATIENT_ID, 'bin-1', adminClaims);

      expect(fhir.create).toHaveBeenCalledTimes(1);
    });

    it('should hold the bytes back when the read cannot be journalled', async () => {
      fhir.create.mockRejectedValue(
        new FhirClientError('POST', 'http://hapi/fhir/AuditEvent', 503),
      );

      await expect(service.readScan(PATIENT_ID, 'bin-1', adminClaims)).rejects.toBeInstanceOf(
        FhirClientError,
      );
    });

    it('should journal the refusal and answer 403 to a doctor without a care link', async () => {
      fhir.search.mockImplementation(async () => bundleOf());

      expect(await errorStatusOf(service.readScan(PATIENT_ID, 'bin-1', doctorClaims))).toBe(403);
      expect(fhir.create).toHaveBeenCalledWith(
        'AuditEvent',
        expect.objectContaining({ action: 'R', outcome: '4' }),
      );
      expect(fhir.read).not.toHaveBeenCalledWith('Binary', expect.anything());
    });

    it('should answer 404 and journal a denied read when the scan belongs to another patient', async () => {
      binary = { ...scanBinary, securityContext: { reference: 'Patient/someone-else' } };

      expect(
        await errorPayloadOf(service.readScan(PATIENT_ID, 'bin-1', adminClaims)),
      ).toMatchObject({ errorCode: 'NOT_FOUND' });
      expect(fhir.create).toHaveBeenCalledWith(
        'AuditEvent',
        expect.objectContaining({ outcome: '4' }),
      );
    });

    it('should answer 404 when the scan does not exist', async () => {
      fhir.read.mockImplementation(async (type) => {
        if (type === 'Patient') return patientResource;
        throw new FhirClientError('GET', 'http://hapi/fhir/Binary/nope', 404);
      });

      expect(await errorStatusOf(service.readScan(PATIENT_ID, 'nope', adminClaims))).toBe(404);
    });
  });
});
