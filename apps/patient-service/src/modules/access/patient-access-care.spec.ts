import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import {
  bundleOf,
  createFhirClientMock,
  doctorClaims,
  errorPayloadOf,
  searchAnswering,
  sharedAppointment,
  sharedEncounter,
} from '../../__tests__/patient-service.fixtures';
import { CARE_APPOINTMENT_STATUSES, CARE_ENCOUNTER_STATUSES, PatientAccessService } from './patient-access.service';

/**
 * Doctor ↔ patient care relationship (API §3.2–3.3, ADR-013). HAPI answers a
 * search, and every resource it returns is re-checked in process (type,
 * status, both participants), so a search parameter HAPI ignores can only
 * ever narrow access. Each test hands HAPI's answer back unfiltered.
 */
describe('PatientAccessService care relationship', () => {
  let fhir: jest.Mocked<FhirClient>;
  let service: PatientAccessService;

  beforeEach(() => {
    fhir = createFhirClientMock();
    service = new PatientAccessService(fhir);
  });

  async function expectViolation(): Promise<void> {
    expect(await errorPayloadOf(service.assertCanRead(doctorClaims, '9f2c'))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
  }

  function answerAppointment(appointment: FhirResource): void {
    fhir.search.mockImplementation(searchAnswering({ Appointment: bundleOf(appointment) }));
  }

  function answerEncounter(encounter: FhirResource): void {
    fhir.search.mockImplementation(searchAnswering({ Encounter: bundleOf(encounter) }));
  }

  describe('shared appointment', () => {
    it.each([...CARE_APPOINTMENT_STATUSES])('should allow access when the shared appointment is %s', async (status) => {
      answerAppointment({ ...sharedAppointment, status });

      await expect(service.assertCanRead(doctorClaims, '9f2c')).resolves.toBeUndefined();
    });

    it.each(['proposed', 'pending', 'waitlist', 'cancelled', 'noshow', 'entered-in-error'])(
      'should throw COMPARTMENT_VIOLATION when HAPI returns a shared appointment that is %s',
      async (status) => {
        answerAppointment({ ...sharedAppointment, status });

        await expectViolation();
      },
    );

    it('should throw COMPARTMENT_VIOLATION when the found appointment does not list this practitioner', async () => {
      answerAppointment({
        ...sharedAppointment,
        participant: [{ actor: { reference: 'Patient/9f2c' } }, { actor: { reference: 'PractitionerRole/role-2' } }],
      });

      await expectViolation();
    });

    it('should throw COMPARTMENT_VIOLATION when the found appointment belongs to another patient', async () => {
      answerAppointment({
        ...sharedAppointment,
        participant: [{ actor: { reference: 'Patient/other' } }, { actor: { reference: 'PractitionerRole/role-1' } }],
      });

      await expectViolation();
    });

    it('should throw COMPARTMENT_VIOLATION when the found appointment has no participants', async () => {
      answerAppointment({ resourceType: 'Appointment', id: 'apt-2', status: 'booked' });

      await expectViolation();
    });

    it('should not accept a resource of another type when the appointment search returns one', async () => {
      answerAppointment({ ...sharedAppointment, resourceType: 'OperationOutcome' });

      await expectViolation();
      expect(fhir.search).toHaveBeenCalledWith('Encounter', expect.anything());
    });

    it('should allow access when the appointment participants carry absolute references', async () => {
      answerAppointment({
        ...sharedAppointment,
        participant: [
          { actor: { reference: 'http://hapi:8080/fhir/Patient/9f2c' } },
          { actor: { reference: 'http://hapi:8080/fhir/PractitionerRole/role-1' } },
        ],
      });

      await expect(service.assertCanRead(doctorClaims, '9f2c')).resolves.toBeUndefined();
    });
  });

  describe('shared encounter', () => {
    it.each([...CARE_ENCOUNTER_STATUSES])('should allow access when the shared encounter is %s', async (status) => {
      answerEncounter({ ...sharedEncounter, status });

      await expect(service.assertCanRead(doctorClaims, '9f2c')).resolves.toBeUndefined();
    });

    it.each(['cancelled', 'entered-in-error', 'unknown'])(
      'should throw COMPARTMENT_VIOLATION when HAPI returns a shared encounter that is %s',
      async (status) => {
        answerEncounter({ ...sharedEncounter, status });

        await expectViolation();
      },
    );

    it('should throw COMPARTMENT_VIOLATION when the found encounter has another patient as subject', async () => {
      answerEncounter({ ...sharedEncounter, subject: { reference: 'Patient/other' } });

      await expectViolation();
    });

    it('should throw COMPARTMENT_VIOLATION when the found encounter has no subject', async () => {
      answerEncounter({ resourceType: 'Encounter', id: 'enc-2', status: 'finished', participant: sharedEncounter['participant'] });

      await expectViolation();
    });

    it('should throw COMPARTMENT_VIOLATION when the found encounter does not list this practitioner', async () => {
      answerEncounter({ ...sharedEncounter, participant: [{ individual: { reference: 'PractitionerRole/role-2' } }] });

      await expectViolation();
    });

    it('should throw COMPARTMENT_VIOLATION when the practitioner appears as an actor instead of an individual', async () => {
      answerEncounter({ ...sharedEncounter, participant: [{ actor: { reference: 'PractitionerRole/role-1' } }] });

      await expectViolation();
    });

    it('should throw COMPARTMENT_VIOLATION when HAPI answers the encounter search with 404', async () => {
      fhir.search.mockImplementation(async (resourceType) => {
        if (resourceType === 'Encounter') {
          throw new FhirClientError('GET', 'http://hapi/fhir/Encounter', 404);
        }
        return bundleOf();
      });

      await expectViolation();
    });

    it('should propagate the outage when HAPI fails the encounter search with 503', async () => {
      fhir.search.mockImplementation(async (resourceType) => {
        if (resourceType === 'Encounter') {
          throw new FhirClientError('GET', 'http://hapi/fhir/Encounter', 503);
        }
        return bundleOf();
      });

      await expect(service.assertCanRead(doctorClaims, '9f2c')).rejects.toBeInstanceOf(FhirClientError);
    });
  });
});
