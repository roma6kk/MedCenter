import type { JwtClaims } from '@medcenter/common';
import { FhirClientError, type FhirClient } from '@medcenter/fhir';

import {
  adminClaims,
  bundleOf,
  createFhirClientMock,
  doctorClaims,
  errorPayloadOf,
  patientClaims,
  searchAnswering,
  sharedAppointment,
  sharedEncounter,
} from '../../__tests__/patient-service.fixtures';
import { CARE_APPOINTMENT_STATUSES, CARE_ENCOUNTER_STATUSES, PatientAccessService } from './patient-access.service';

/**
 * Who may read a patient card (scope per role, PATIENT compartment, ADMIN,
 * fail-closed identities). The doctor ↔ patient care relationship itself is
 * covered in `patient-access-care.spec.ts`.
 */
describe('PatientAccessService', () => {
  let fhir: jest.Mocked<FhirClient>;
  let service: PatientAccessService;

  beforeEach(() => {
    fhir = createFhirClientMock();
    service = new PatientAccessService(fhir);
  });

  describe('patient tokens', () => {
    it('should allow access when a patient reads their own record', async () => {
      await expect(service.assertCanRead(patientClaims, '9f2c')).resolves.toBeUndefined();
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should allow access when the patient claim is a Patient reference to the requested id', async () => {
      const claims: JwtClaims = { ...patientClaims, patient: 'Patient/9f2c' };

      await expect(service.assertCanRead(claims, '9f2c')).resolves.toBeUndefined();
    });

    it('should throw COMPARTMENT_VIOLATION when a patient reads another patient record', async () => {
      await expect(service.assertCanRead(patientClaims, 'someone-else')).rejects.toThrow('COMPARTMENT_VIOLATION');
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should throw COMPARTMENT_VIOLATION when the patient token carries no patient claim', async () => {
      const claims: JwtClaims = { ...patientClaims, patient: undefined };

      expect(await errorPayloadOf(service.assertCanRead(claims, '9f2c'))).toMatchObject({
        errorCode: 'COMPARTMENT_VIOLATION',
      });
    });

    it('should throw FORBIDDEN_SCOPE when a patient token lacks patient/*.read', async () => {
      const claims: JwtClaims = { ...patientClaims, scope: 'patient/*.write' };

      expect(await errorPayloadOf(service.assertCanRead(claims, '9f2c'))).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
    });

    it('should throw FORBIDDEN_SCOPE when a patient token carries only the practitioner scope user/*.read', async () => {
      const claims: JwtClaims = { ...patientClaims, scope: 'user/*.read' };

      expect(await errorPayloadOf(service.assertCanRead(claims, '9f2c'))).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
    });
  });

  describe('doctor tokens', () => {
    it('should search the shared appointment with patient, actor, care statuses and _count=1 when checking care', async () => {
      // Arrange
      fhir.search.mockImplementation(searchAnswering({ Appointment: bundleOf(sharedAppointment) }));

      // Act
      await service.assertCanRead(doctorClaims, '9f2c');

      // Assert
      expect(fhir.search).toHaveBeenCalledWith('Appointment', {
        patient: 'Patient/9f2c',
        actor: 'PractitionerRole/role-1',
        status: CARE_APPOINTMENT_STATUSES.join(','),
        _count: 1,
      });
      expect(fhir.search).toHaveBeenCalledTimes(1);
    });

    it('should search the shared encounter with patient, participant, care statuses and _count=1 when no appointment is shared', async () => {
      fhir.search.mockImplementation(searchAnswering({ Encounter: bundleOf(sharedEncounter) }));

      await service.assertCanRead(doctorClaims, '9f2c');

      expect(fhir.search).toHaveBeenNthCalledWith(2, 'Encounter', {
        patient: 'Patient/9f2c',
        participant: 'PractitionerRole/role-1',
        status: CARE_ENCOUNTER_STATUSES.join(','),
        _count: 1,
      });
    });

    it('should throw COMPARTMENT_VIOLATION when the doctor shares no appointment or encounter', async () => {
      await expect(service.assertCanRead(doctorClaims, '9f2c')).rejects.toThrow('COMPARTMENT_VIOLATION');
      expect(fhir.search).toHaveBeenCalledTimes(2);
    });

    it('should fail closed with COMPARTMENT_VIOLATION when the doctor token has no fhirUser', async () => {
      const claims: JwtClaims = { ...doctorClaims, fhirUser: undefined };

      await expect(service.assertCanRead(claims, '9f2c')).rejects.toThrow('COMPARTMENT_VIOLATION');
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it.each(['Patient/9f2c', 'Practitioner/doc-1', 'PractitionerRole/..', 'PractitionerRole/role-1,role-2'])(
      'should fail closed with COMPARTMENT_VIOLATION without searching when fhirUser is %s',
      async (fhirUser) => {
        const claims: JwtClaims = { ...doctorClaims, fhirUser };

        expect(await errorPayloadOf(service.assertCanRead(claims, '9f2c'))).toMatchObject({
          errorCode: 'COMPARTMENT_VIOLATION',
        });
        expect(fhir.search).not.toHaveBeenCalled();
      },
    );

    it('should answer COMPARTMENT_VIOLATION rather than NOT_FOUND when HAPI does not know the patient', async () => {
      fhir.search.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/Appointment', 404));

      expect(await errorPayloadOf(service.assertCanRead(doctorClaims, 'missing'))).toMatchObject({
        errorCode: 'COMPARTMENT_VIOLATION',
      });
    });

    it('should propagate an upstream outage when HAPI is unavailable', async () => {
      fhir.search.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/Appointment', 503));

      await expect(service.assertCanRead(doctorClaims, '9f2c')).rejects.toBeInstanceOf(FhirClientError);
    });

    it('should throw FORBIDDEN_SCOPE without searching when a doctor token lacks user/*.read', async () => {
      const claims: JwtClaims = { ...doctorClaims, scope: 'patient/*.read' };

      expect(await errorPayloadOf(service.assertCanRead(claims, '9f2c'))).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
      expect(fhir.search).not.toHaveBeenCalled();
    });
  });

  describe('admin and unknown roles', () => {
    it('should allow access without a compartment lookup when the caller is an admin', async () => {
      await expect(service.assertCanRead(adminClaims, '9f2c')).resolves.toBeUndefined();
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should throw FORBIDDEN_SCOPE when an admin token lacks user/*.read', async () => {
      const claims: JwtClaims = { ...adminClaims, scope: 'user/*.write' };

      expect(await errorPayloadOf(service.assertCanRead(claims, '9f2c'))).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
    });

    it('should throw FORBIDDEN_ROLE when the role is not recognised', async () => {
      const claims: JwtClaims = { ...adminClaims, role: 'NURSE' };

      expect(await errorPayloadOf(service.assertCanRead(claims, '9f2c'))).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
      expect(fhir.search).not.toHaveBeenCalled();
    });
  });

  describe('assertCanWrite (consent management, ADR-019)', () => {
    it('should allow an admin with user/*.write without a compartment lookup', async () => {
      await expect(service.assertCanWrite(adminClaims, '9f2c')).resolves.toBeUndefined();
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should allow a doctor who shares an appointment with the patient', async () => {
      fhir.search.mockImplementation(searchAnswering({ Appointment: bundleOf(sharedAppointment) }));

      await expect(service.assertCanWrite(doctorClaims, '9f2c')).resolves.toBeUndefined();
    });

    it('should throw COMPARTMENT_VIOLATION when a doctor has no care relationship with the patient', async () => {
      expect(await errorPayloadOf(service.assertCanWrite(doctorClaims, '9f2c'))).toMatchObject({
        errorCode: 'COMPARTMENT_VIOLATION',
      });
    });

    it('should throw FORBIDDEN_SCOPE without searching when the token holds only user/*.read', async () => {
      const claims: JwtClaims = { ...doctorClaims, scope: 'user/*.read' };

      expect(await errorPayloadOf(service.assertCanWrite(claims, '9f2c'))).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should throw FORBIDDEN_ROLE when a patient tries to manage a consent for a patient id', async () => {
      expect(await errorPayloadOf(service.assertCanWrite(patientClaims, '9f2c'))).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
    });
  });
});
