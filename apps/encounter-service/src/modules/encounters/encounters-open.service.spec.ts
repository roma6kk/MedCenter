import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { EncounterPublisherService } from '../events/encounter-publisher.service';
import { TerminologyValidatorService } from '../terminology/terminology-validator.service';
import {
  APPOINTMENT_ID,
  ENCOUNTER_ID,
  adminClaims,
  bookedAppointment,
  committedEntries,
  createFhirMock,
  doctorClaims,
  errorPayloadOf,
  finishedEncounter,
  healthcareService,
  inProgressEncounter,
  otherDoctorClaims,
  transactionResponse,
} from './__tests__/encounter.fixtures';
import { EncountersService } from './encounters.service';

function searchResult(...resources: FhirResource[]): { total: number; entry: Array<{ resource: FhirResource }> } {
  return { total: resources.length, entry: resources.map((resource) => ({ resource })) };
}

describe('EncountersService.open / findOne', () => {
  let service: EncountersService;
  let fhir: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhir = createFhirMock();
    fhir.read.mockImplementation(async (type) => (type === 'Appointment' ? bookedAppointment : healthcareService));
    fhir.search.mockResolvedValue(searchResult());
    fhir.batch.mockResolvedValue(transactionResponse([`Encounter/${ENCOUNTER_ID}/_history/1`, 'AuditEvent/ae-1/_history/1']));
    const publisher = { publishCompleted: jest.fn() } as unknown as EncounterPublisherService;
    service = new EncountersService(fhir, new TerminologyValidatorService(fhir), publisher, 'warn');
  });

  it('should write the request id of the opening call into the AuditEvent of the new encounter', async () => {
    await service.open(doctorClaims, { appointmentId: APPOINTMENT_ID }, 'req-7');

    const audit = committedEntries(fhir).find((entry) => entry.resource?.['resourceType'] === 'AuditEvent')?.resource;
    expect(JSON.stringify(audit?.['entity'])).toContain('req-7');
  });

  it('should create an in-progress ambulatory encounter with a conditional create when the appointment is booked', async () => {
    const result = await service.open(doctorClaims, { appointmentId: APPOINTMENT_ID });

    const [encounterEntry, auditEntry] = committedEntries(fhir);
    expect(encounterEntry?.request).toEqual({
      method: 'POST',
      url: 'Encounter',
      ifNoneExist: `appointment=Appointment/${APPOINTMENT_ID}`,
    });
    expect(encounterEntry?.resource).toMatchObject({
      status: 'in-progress',
      class: { code: 'AMB' },
      subject: { reference: 'Patient/pat-1' },
      participant: [expect.objectContaining({ individual: { reference: 'PractitionerRole/role-1' } })],
      appointment: [{ reference: `Appointment/${APPOINTMENT_ID}` }],
      serviceType: { coding: [expect.objectContaining({ code: '10001' })] },
    });
    expect(auditEntry?.resource.resourceType).toBe('AuditEvent');
    expect(result).toEqual({ created: true, encounter: expect.objectContaining({ id: ENCOUNTER_ID, status: 'in-progress' }) });
  });

  it('should make the AuditEvent of the opening conditional on the same appointment so a lost concurrent open writes none', async () => {
    await service.open(doctorClaims, { appointmentId: APPOINTMENT_ID });

    const [, auditEntry] = committedEntries(fhir);
    const name = `encounter-opened:Appointment/${APPOINTMENT_ID}`;
    expect(auditEntry?.request).toEqual({
      method: 'POST',
      url: 'AuditEvent',
      ifNoneExist: `AuditEvent?entity-name:exact=${encodeURIComponent(name)}`,
    });
    expect(JSON.stringify(auditEntry?.resource['entity'])).toContain(name);
  });

  it('should make the emergency-bypass AuditEvent of the opening conditional too', async () => {
    await service.open(doctorClaims, { appointmentId: APPOINTMENT_ID, emergencyReason: 'Пациент без сознания, согласие дать некому' });

    const bypass = committedEntries(fhir).find((entry) => entry.resource['action'] === 'E');
    expect(bypass?.request).toMatchObject({
      ifNoneExist: `AuditEvent?entity-name:exact=${encodeURIComponent(`encounter-emergency-open:Appointment/${APPOINTMENT_ID}`)}`,
    });
  });

  it('should reject opening with ENCOUNTER_STATE_INVALID when the appointment is not booked', async () => {
    fhir.read.mockResolvedValue({ ...bookedAppointment, status: 'cancelled' });

    expect(await errorPayloadOf(service.open(doctorClaims, { appointmentId: APPOINTMENT_ID }))).toMatchObject({
      errorCode: 'ENCOUNTER_STATE_INVALID',
    });
    expect(fhir.batch).not.toHaveBeenCalled();
  });

  it('should refuse a doctor who does not participate in the appointment', async () => {
    expect(await errorPayloadOf(service.open(otherDoctorClaims, { appointmentId: APPOINTMENT_ID }))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
    expect(fhir.batch).not.toHaveBeenCalled();
  });

  it('should fail closed when the token carries no PractitionerRole identity', async () => {
    const noIdentity = { ...doctorClaims, fhirUser: undefined };

    expect(await errorPayloadOf(service.open(noIdentity, { appointmentId: APPOINTMENT_ID }))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
    expect(fhir.read).not.toHaveBeenCalled();
  });

  it('should return the open encounter instead of creating a second one when the appointment already has it', async () => {
    fhir.search.mockResolvedValue(searchResult(inProgressEncounter));

    const result = await service.open(doctorClaims, { appointmentId: APPOINTMENT_ID });

    expect(result).toEqual({ created: false, encounter: expect.objectContaining({ id: ENCOUNTER_ID, status: 'in-progress' }) });
    expect(fhir.batch).not.toHaveBeenCalled();
  });

  it('should return the concurrently created encounter when the conditional create matched an existing one', async () => {
    fhir.batch.mockResolvedValue({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [{ response: { status: '200 OK', location: `Encounter/${ENCOUNTER_ID}/_history/1` } }],
    });
    fhir.read.mockImplementation(async (type) => (type === 'Appointment' ? bookedAppointment : inProgressEncounter));

    const result = await service.open(doctorClaims, { appointmentId: APPOINTMENT_ID });

    expect(result).toEqual({ created: false, encounter: expect.objectContaining({ id: ENCOUNTER_ID }) });
    expect(fhir.read).toHaveBeenCalledWith('Encounter', ENCOUNTER_ID);
  });

  it('should open the encounter without a service type when the booked service no longer exists', async () => {
    fhir.read.mockImplementation(async (type) => {
      if (type === 'Appointment') {
        return bookedAppointment;
      }
      throw new FhirClientError('GET', 'http://hapi/fhir/HealthcareService/svc-1', 404, '{}');
    });

    await service.open(doctorClaims, { appointmentId: APPOINTMENT_ID });

    expect(committedEntries(fhir)[0]?.resource['serviceType']).toBeUndefined();
  });

  it('should reject opening with ENCOUNTER_STATE_INVALID when the encounter of the appointment is finished', async () => {
    fhir.search.mockResolvedValue(searchResult(finishedEncounter));

    expect(await errorPayloadOf(service.open(doctorClaims, { appointmentId: APPOINTMENT_ID }))).toMatchObject({
      errorCode: 'ENCOUNTER_STATE_INVALID',
    });
  });

  it('should return the clinical content when the participant doctor reads a finished encounter', async () => {
    fhir.search.mockResolvedValue(
      searchResult(
        { ...finishedEncounter, period: { start: '2026-11-02T06:00:00Z', end: '2026-11-02T06:20:00Z' } },
        {
          resourceType: 'Condition',
          id: 'cond-1',
          encounter: { reference: `Encounter/${ENCOUNTER_ID}` },
          code: { coding: [{ system: 'https://fhir.by/CodeSystem/InternClassificDiseases10', code: 'J06.9', display: 'ОРВИ' }] },
          verificationStatus: { coding: [{ code: 'unconfirmed' }] },
        },
        { resourceType: 'ClinicalImpression', id: 'ci-1', encounter: { reference: `Encounter/${ENCOUNTER_ID}` }, summary: 'Итог' },
        { resourceType: 'CarePlan', id: 'cp-1', encounter: { reference: `Encounter/${ENCOUNTER_ID}` }, description: 'Покой' },
      ),
    );

    const details = await service.findOne(doctorClaims, ENCOUNTER_ID);

    expect(details).toMatchObject({
      id: ENCOUNTER_ID,
      status: 'finished',
      diagnosisCodes: ['J06.9'],
      summary: 'Итог',
      recommendations: 'Покой',
      diagnoses: [{ code: 'J06.9', display: 'ОРВИ', verificationStatus: 'working' }],
    });
  });

  it('should refuse a doctor who does not participate in the encounter', async () => {
    fhir.search.mockResolvedValue(searchResult(inProgressEncounter));

    expect(await errorPayloadOf(service.findOne(otherDoctorClaims, ENCOUNTER_ID))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
  });

  it('should let an ADMIN read any encounter', async () => {
    fhir.search.mockResolvedValue(searchResult(inProgressEncounter));

    await expect(service.findOne(adminClaims, ENCOUNTER_ID)).resolves.toMatchObject({ id: ENCOUNTER_ID });
  });

  it('should answer NOT_FOUND when no encounter has the id', async () => {
    expect(await errorPayloadOf(service.findOne(adminClaims, 'missing'))).toMatchObject({ errorCode: 'NOT_FOUND' });
  });
});
