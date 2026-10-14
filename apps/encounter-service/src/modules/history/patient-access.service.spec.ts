import { FhirClientError, type FhirClient } from '@medcenter/fhir';

import {
  adminClaims,
  bookedAppointment,
  createFhirMock,
  doctorClaims,
  errorPayloadOf,
  inProgressEncounter,
  patientClaims,
} from '../encounters/__tests__/encounter.fixtures';
import { PatientAccessService } from './patient-access.service';

describe('PatientAccessService', () => {
  let fhir: jest.Mocked<FhirClient>;
  let service: PatientAccessService;

  beforeEach(() => {
    fhir = createFhirMock();
    fhir.search.mockResolvedValue({ total: 0, entry: [] });
    service = new PatientAccessService(fhir);
  });

  it('should let a patient read their own record when the path names their compartment', async () => {
    await expect(service.resolveReadablePatient(patientClaims, 'pat-1')).resolves.toBe('Patient/pat-1');
    expect(fhir.search).not.toHaveBeenCalled();
  });

  it('should refuse a patient with COMPARTMENT_VIOLATION when the path names another patient', async () => {
    expect(await errorPayloadOf(service.resolveReadablePatient(patientClaims, 'pat-2'))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
  });

  it('should let a doctor read a patient when they share an encounter', async () => {
    fhir.search.mockResolvedValueOnce({ total: 1, entry: [{ resource: inProgressEncounter }] });

    await expect(service.resolveReadablePatient(doctorClaims, 'pat-1')).resolves.toBe('Patient/pat-1');
    expect(fhir.search).toHaveBeenCalledWith('Encounter', {
      patient: 'Patient/pat-1',
      participant: 'PractitionerRole/role-1',
      status: 'planned,arrived,triaged,in-progress,onleave,finished',
      _count: 1,
    });
  });

  it('should let a doctor read a patient when they only share a booked appointment', async () => {
    fhir.search.mockResolvedValueOnce({ total: 0 }).mockResolvedValueOnce({ total: 1, entry: [{ resource: bookedAppointment }] });

    await expect(service.resolveReadablePatient(doctorClaims, 'pat-1')).resolves.toBe('Patient/pat-1');
    expect(fhir.search).toHaveBeenLastCalledWith('Appointment', {
      patient: 'Patient/pat-1',
      actor: 'PractitionerRole/role-1',
      status: 'booked,arrived,checked-in,fulfilled',
      _count: 1,
    });
  });

  it('should refuse a doctor when the found encounter belongs to another patient', async () => {
    // Defence in depth: a search parameter the server ignored must not widen the compartment.
    const foreign = { ...inProgressEncounter, subject: { reference: 'Patient/pat-2' } };
    fhir.search.mockResolvedValueOnce({ total: 1, entry: [{ resource: foreign }] }).mockResolvedValueOnce({ total: 0 });

    expect(await errorPayloadOf(service.resolveReadablePatient(doctorClaims, 'pat-1'))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
  });

  it('should refuse a doctor when the found encounter does not name them as a participant', async () => {
    const foreign = { ...inProgressEncounter, participant: [{ individual: { reference: 'PractitionerRole/role-9' } }] };
    fhir.search.mockResolvedValueOnce({ total: 1, entry: [{ resource: foreign }] }).mockResolvedValueOnce({ total: 0 });

    expect(await errorPayloadOf(service.resolveReadablePatient(doctorClaims, 'pat-1'))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
  });

  it('should refuse a doctor when the found encounter was entered in error', async () => {
    const withdrawn = { ...inProgressEncounter, status: 'entered-in-error' };
    fhir.search.mockResolvedValueOnce({ total: 1, entry: [{ resource: withdrawn }] }).mockResolvedValueOnce({ total: 0 });

    expect(await errorPayloadOf(service.resolveReadablePatient(doctorClaims, 'pat-1'))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
  });

  it.each(['cancelled', 'noshow', 'proposed'])('should refuse a doctor when the only shared appointment is %s', async (status) => {
    fhir.search.mockResolvedValueOnce({ total: 0 }).mockResolvedValueOnce({ total: 1, entry: [{ resource: { ...bookedAppointment, status } }] });

    expect(await errorPayloadOf(service.resolveReadablePatient(doctorClaims, 'pat-1'))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
  });

  it('should refuse a doctor when the found appointment is of another practitioner', async () => {
    const foreign = {
      ...bookedAppointment,
      participant: [{ actor: { reference: 'Patient/pat-1' } }, { actor: { reference: 'PractitionerRole/role-9' } }],
    };
    fhir.search.mockResolvedValueOnce({ total: 0 }).mockResolvedValueOnce({ total: 1, entry: [{ resource: foreign }] });

    expect(await errorPayloadOf(service.resolveReadablePatient(doctorClaims, 'pat-1'))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
  });

  it('should refuse a doctor with COMPARTMENT_VIOLATION when they never treated the patient', async () => {
    expect(await errorPayloadOf(service.resolveReadablePatient(doctorClaims, 'pat-1'))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
  });

  it('should refuse with COMPARTMENT_VIOLATION rather than 404 when HAPI does not know the patient id', async () => {
    fhir.search.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/Encounter', 404, '{}'));

    expect(await errorPayloadOf(service.resolveReadablePatient(doctorClaims, 'unknown'))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
  });

  it('should propagate an unavailable FHIR server when the care lookup fails', async () => {
    fhir.search.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/Encounter', 503, '{}'));

    expect(await errorPayloadOf(service.resolveReadablePatient(doctorClaims, 'pat-1'))).toMatchObject({ errorCode: 'INTERNAL' });
  });

  it('should fail closed when a doctor token carries no PractitionerRole identity', async () => {
    const noIdentity = { ...doctorClaims, fhirUser: undefined };

    expect(await errorPayloadOf(service.resolveReadablePatient(noIdentity, 'pat-1'))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
    expect(fhir.search).not.toHaveBeenCalled();
  });

  it('should let an admin read any patient without a FHIR lookup', async () => {
    await expect(service.resolveReadablePatient(adminClaims, 'pat-9')).resolves.toBe('Patient/pat-9');
    expect(fhir.search).not.toHaveBeenCalled();
  });
});
