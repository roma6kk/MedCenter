import { FhirClientError, PatientReadAudit, type FhirClient, type FhirResource } from '@medcenter/fhir';

import {
  adminClaims,
  bundleOf,
  createFhirClientMock,
  doctorClaims,
  errorPayloadOf,
  errorStatusOf,
  patientClaims as claims,
  searchAnswering,
  sharedAppointment,
} from '../../__tests__/patient-service.fixtures';
import { PatientAccessService } from '../access/patient-access.service';
import { PatientsService } from './patients.service';

describe('PatientsService', () => {
  let fhir: jest.Mocked<FhirClient>;
  let service: PatientsService;

  beforeEach(() => {
    fhir = createFhirClientMock();
    service = new PatientsService(fhir, new PatientAccessService(fhir), new PatientReadAudit(fhir));
  });

  describe('getMePatient', () => {
    it('should return the profile of the patient in the JWT context when the token carries a patient claim', async () => {
      // Act
      const profile = await service.getMePatient(claims);

      // Assert
      expect(profile.id).toBe('9f2c');
      expect(fhir.read).toHaveBeenCalledWith('Patient', '9f2c');
    });

    it('should map the R4 Patient into the card when HAPI returns it', async () => {
      const profile = await service.getMePatient(claims);

      expect(profile).toEqual({
        id: '9f2c',
        active: true,
        fullName: 'Иванов Иван',
        lastName: 'Иванов',
        firstName: 'Иван',
        birthDate: '1990-05-12',
        gender: 'male',
        telecom: [],
        identifiers: [],
      });
    });

    it('should resolve the patient from a Patient reference claim when the token carries one', async () => {
      await service.getMePatient({ ...claims, patient: 'Patient/9f2c' });

      expect(fhir.read).toHaveBeenCalledWith('Patient', '9f2c');
    });

    it('should throw COMPARTMENT_VIOLATION without reading FHIR when the token has no patient claim', async () => {
      await expect(service.getMePatient({ ...claims, patient: undefined })).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'COMPARTMENT_VIOLATION' }),
      });
      expect(fhir.read).not.toHaveBeenCalled();
    });

    it.each(['9f2c,other', '..', '9f2c/_history/1'])(
      'should throw COMPARTMENT_VIOLATION without reading FHIR when the patient claim is %s',
      async (patient) => {
        expect(await errorPayloadOf(service.getMePatient({ ...claims, patient }))).toMatchObject({
          errorCode: 'COMPARTMENT_VIOLATION',
        });
        expect(fhir.read).not.toHaveBeenCalled();
      },
    );

    it('should surface 502 when HAPI is unavailable while reading the own profile', async () => {
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/Patient/9f2c', 503));

      expect(await errorStatusOf(service.getMePatient(claims))).toBe(502);
    });
  });

  describe('getById', () => {
    it('should reject access to another patient record when the token is patient-scoped', async () => {
      await expect(service.getById('someone-else', claims)).rejects.toThrow('COMPARTMENT_VIOLATION');
      expect(fhir.read).not.toHaveBeenCalled();
    });

    it('should return the own record when a patient requests their own id', async () => {
      const profile = await service.getById('9f2c', claims);

      expect(profile.lastName).toBe('Иванов');
    });

    it('should read the patient only after the care search when a doctor shares an appointment', async () => {
      // Arrange
      fhir.search.mockImplementation(searchAnswering({ Appointment: bundleOf(sharedAppointment) }));

      // Act
      const profile = await service.getById('9f2c', doctorClaims);

      // Assert
      expect(profile.id).toBe('9f2c');
      expect(fhir.search.mock.invocationCallOrder[0]).toBeLessThan(fhir.read.mock.invocationCallOrder[0] ?? 0);
    });

    it('should throw COMPARTMENT_VIOLATION without reading FHIR when the doctor shares no care', async () => {
      await expect(service.getById('9f2c', doctorClaims)).rejects.toThrow('COMPARTMENT_VIOLATION');
      expect(fhir.read).not.toHaveBeenCalled();
    });

    it('should throw FORBIDDEN_SCOPE without reading FHIR when the admin token lacks user/*.read', async () => {
      expect(await errorPayloadOf(service.getById('9f2c', { ...adminClaims, scope: 'launch' }))).toMatchObject({
        errorCode: 'FORBIDDEN_SCOPE',
      });
      expect(fhir.read).not.toHaveBeenCalled();
    });

    describe('read audit (ADR-018)', () => {
      const auditEvents = (): unknown[] => fhir.create.mock.calls.filter(([type]) => type === 'AuditEvent').map(([, event]) => event);

      it('should write an AuditEvent when an administrator reads a card', async () => {
        await service.getById('9f2c', adminClaims, 'req-1');

        expect(auditEvents()).toEqual([
          expect.objectContaining({
            action: 'R',
            outcome: '0',
            agent: [expect.objectContaining({ who: { identifier: { value: 'user-a' } } })],
            entity: [expect.objectContaining({ what: { reference: 'Patient/9f2c' } }), expect.anything()],
          }),
        ]);
      });

      it('should write an AuditEvent when a doctor with shared care reads a card', async () => {
        fhir.search.mockImplementation(searchAnswering({ Appointment: bundleOf(sharedAppointment) }));

        await service.getById('9f2c', doctorClaims, 'req-2');

        expect(auditEvents()).toEqual([
          expect.objectContaining({ outcome: '0', agent: [expect.objectContaining({ who: { identifier: { value: 'user-d' } } })] }),
        ]);
      });

      it('should write an AuditEvent with outcome 4 when the doctor shares no care', async () => {
        await expect(service.getById('1442', doctorClaims, 'req-3')).rejects.toThrow('COMPARTMENT_VIOLATION');

        expect(auditEvents()).toEqual([expect.objectContaining({ action: 'R', outcome: '4' })]);
      });

      it('should write nothing when a patient reads their own card', async () => {
        await service.getById('9f2c', claims, 'req-4');

        expect(auditEvents()).toEqual([]);
      });

      it('should still answer when the AuditEvent cannot be stored', async () => {
        fhir.create.mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir/AuditEvent', 503));

        await expect(service.getById('9f2c', adminClaims, 'req-5')).resolves.toMatchObject({ id: '9f2c' });
      });

      it('should write nothing when the patient does not exist', async () => {
        fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/Patient/nope', 404));

        await expect(service.getById('nope', adminClaims, 'req-6')).rejects.toBeDefined();

        expect(auditEvents()).toEqual([]);
      });
    });

    it('should propagate NOT_FOUND when HAPI does not know the id', async () => {
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/Patient/nope', 404));

      await expect(service.getById('nope', adminClaims)).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'NOT_FOUND' }),
      });
    });

    it('should propagate NOT_FOUND when HAPI reports the patient as deleted with 410', async () => {
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/Patient/gone', 410));

      expect(await errorStatusOf(service.getById('gone', adminClaims))).toBe(404);
    });

    it('should throw NOT_FOUND when HAPI answers with a resource of another type', async () => {
      fhir.read.mockResolvedValue({ resourceType: 'OperationOutcome' });

      await expect(service.getById('9f2c', adminClaims)).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'NOT_FOUND' }),
      });
    });

    it('should surface 504 when the HAPI read times out', async () => {
      fhir.read.mockRejectedValue(
        new FhirClientError('GET', 'http://hapi/fhir/Patient/9f2c', undefined, undefined, { timedOut: true }),
      );

      expect(await errorStatusOf(service.getById('9f2c', adminClaims))).toBe(504);
    });
  });
  describe('updateMyPhone (API §3.12)', () => {
    const stored: FhirResource = {
      resourceType: 'Patient',
      id: '9f2c',
      meta: { versionId: '3' },
      name: [{ family: 'Иванов', given: ['Иван'] }],
      telecom: [
        { system: 'email', value: 'ivanov@example.by', use: 'home' },
        { system: 'phone', value: '+375171111111', use: 'old' },
        { system: 'phone', value: '+375291111111', use: 'mobile' },
      ],
    };
    const written = (): ReadonlyArray<{ resource: FhirResource; request: Record<string, string> }> =>
      (fhir.batch.mock.calls[0]?.[0]['entry'] ?? []) as never;

    beforeEach(() => {
      fhir.read.mockResolvedValue(stored);
      fhir.batch.mockResolvedValue({
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: [{ response: { status: '200 OK', etag: 'W/"4"' } }, { response: { status: '201 Created' } }],
      });
    });

    it('should replace only the live phone and keep the e-mail and the old number when the version matches', async () => {
      const profile = await service.updateMyPhone(claims, '3', '+375299999999', 'req-1');

      const [patientWrite] = written();
      expect(patientWrite?.request).toEqual({ method: 'PUT', url: 'Patient/9f2c', ifMatch: 'W/"3"' });
      expect(patientWrite?.resource['telecom']).toEqual([
        { system: 'email', value: 'ivanov@example.by', use: 'home' },
        { system: 'phone', value: '+375171111111', use: 'old' },
        { system: 'phone', value: '+375299999999', use: 'mobile' },
      ]);
      expect(patientWrite?.resource['name']).toEqual(stored['name']);
      expect(profile.telecom).toEqual([
        { system: 'email', value: 'ivanov@example.by', use: 'home' },
        { system: 'phone', value: '+375299999999', use: 'mobile' },
      ]);
      expect(profile.version).toBe('4');
    });

    it('should add a mobile phone when the patient has none', async () => {
      fhir.read.mockResolvedValue({ ...stored, telecom: undefined });

      await service.updateMyPhone(claims, '3', '+375299999999');

      expect(written()[0]?.resource['telecom']).toEqual([{ system: 'phone', value: '+375299999999', use: 'mobile' }]);
    });

    it('should write an update AuditEvent in the same transaction as the Patient', async () => {
      await service.updateMyPhone(claims, '3', '+375299999999', 'req-1');

      expect(written()).toHaveLength(2);
      expect(written()[1]?.resource).toMatchObject({
        resourceType: 'AuditEvent',
        action: 'U',
        outcome: '0',
        agent: [expect.objectContaining({ who: { identifier: { value: 'user-p' } } })],
        entity: expect.arrayContaining([expect.objectContaining({ what: { reference: 'Patient/9f2c' } })]),
      });
      expect(JSON.stringify(written()[1]?.resource)).not.toContain('+375299999999');
    });

    it('should answer 409 CONFLICT without writing when the stored version is newer than the one sent', async () => {
      const payload = await errorPayloadOf(service.updateMyPhone(claims, '2', '+375299999999'));

      expect(payload).toMatchObject({ errorCode: 'CONFLICT' });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should answer 409 CONFLICT when HAPI refuses the write because the version moved on in between', async () => {
      fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir', 412));

      expect(await errorStatusOf(service.updateMyPhone(claims, '3', '+375299999999'))).toBe(409);
    });

    it('should take the patient from the token only and refuse a token without a patient claim', async () => {
      expect(await errorPayloadOf(service.updateMyPhone({ ...claims, patient: undefined }, '3', '+375299999999'))).toMatchObject({
        errorCode: 'COMPARTMENT_VIOLATION',
      });
      expect(fhir.read).not.toHaveBeenCalled();
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should answer 404 NOT_FOUND when HAPI has no such Patient', async () => {
      fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/Patient/9f2c', 404));

      expect(await errorStatusOf(service.updateMyPhone(claims, '3', '+375299999999'))).toBe(404);
    });
  });
});
