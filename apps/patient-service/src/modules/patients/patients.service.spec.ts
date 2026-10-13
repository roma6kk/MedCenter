import { FhirClientError, type FhirClient } from '@medcenter/fhir';

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
    service = new PatientsService(fhir, new PatientAccessService(fhir));
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
});
