import { ConflictException } from '@nestjs/common';
import { FhirClientError, type FhirClient } from '@medcenter/fhir';

import { EncounterPublisherService } from '../events/encounter-publisher.service';
import { TerminologyValidatorService } from '../terminology/terminology-validator.service';
import {
  APPOINTMENT_ID,
  ENCOUNTER_ID,
  bookedAppointment,
  committedEntries,
  createFhirMock,
  doctorClaims,
  errorPayloadOf,
  finishedEncounter,
  inProgressEncounter,
  otherDoctorClaims,
  transactionResponse,
  validCompleteDto,
  validateCodeAnswer,
} from './__tests__/encounter.fixtures';
import type { CompleteEncounterDto } from './dto/complete-encounter.dto';
import { EncountersService } from './encounters.service';

const UNKNOWN_CODES: ReadonlySet<string> = new Set(['X99']);

function dtoWithCode(code: string): CompleteEncounterDto {
  const dto = validCompleteDto();
  return { ...dto, diagnoses: [{ code, display: 'Неизвестный диагноз' }] };
}

describe('EncountersService.complete', () => {
  let service: EncountersService;
  let fhir: jest.Mocked<FhirClient>;
  let publisher: jest.Mocked<EncounterPublisherService>;

  beforeEach(() => {
    fhir = createFhirMock();
    fhir.read.mockImplementation(async (type) => (type === 'Encounter' ? inProgressEncounter : bookedAppointment));
    fhir.operation.mockImplementation(async (_type, _operation, params) =>
      validateCodeAnswer(!UNKNOWN_CODES.has(String(params?.['code']))),
    );
    fhir.search.mockResolvedValue({ total: 0 }); // no Consent: CONSENT_ENFORCEMENT=warn lets it through
    fhir.batch.mockResolvedValue(transactionResponse([`Encounter/${ENCOUNTER_ID}/_history/2`]));
    publisher = { publishCompleted: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<EncounterPublisherService>;
    service = new EncountersService(fhir, new TerminologyValidatorService(fhir), publisher, 'warn');
  });

  it('should reject completing an encounter twice when it is already finished', async () => {
    fhir.read.mockResolvedValue(finishedEncounter);

    await expect(service.complete(doctorClaims, ENCOUNTER_ID, validCompleteDto())).rejects.toThrow('ENCOUNTER_STATE_INVALID');
    expect(fhir.operation).not.toHaveBeenCalled();
    expect(fhir.batch).not.toHaveBeenCalled();
  });

  it('should reject a diagnosis code outside the seeded ICD-10 ValueSet', async () => {
    await expect(service.complete(doctorClaims, ENCOUNTER_ID, dtoWithCode('X99'))).rejects.toThrow('INVALID_ICD10_CODE');
    expect(fhir.batch).not.toHaveBeenCalled();
  });

  it('should reject an ATC code outside the seed with TERMINOLOGY_NOT_FOUND and write nothing', async () => {
    fhir.operation.mockImplementation(async (_type, _operation, params) => validateCodeAnswer(params?.['code'] !== 'J01FA10'));

    expect(await errorPayloadOf(service.complete(doctorClaims, ENCOUNTER_ID, validCompleteDto()))).toMatchObject({
      errorCode: 'TERMINOLOGY_NOT_FOUND',
    });
    expect(fhir.batch).not.toHaveBeenCalled();
    expect(publisher.publishCompleted).not.toHaveBeenCalled();
  });

  it('should link each prescription to the encounter and its condition', async () => {
    await service.complete(doctorClaims, ENCOUNTER_ID, validCompleteDto());

    const entries = committedEntries(fhir);
    const condition = entries.find((entry) => entry.resource.resourceType === 'Condition');
    expect(condition?.fullUrl).toMatch(/^urn:uuid:/);
    for (const type of ['MedicationRequest', 'ServiceRequest']) {
      const prescription = entries.find((entry) => entry.resource.resourceType === type);
      expect(prescription?.resource).toEqual(
        expect.objectContaining({
          encounter: { reference: `Encounter/${ENCOUNTER_ID}` },
          reasonReference: expect.arrayContaining([expect.objectContaining({ reference: condition?.fullUrl })]),
        }),
      );
    }
  });

  it('should commit every clinical resource in one If-Match guarded transaction when the encounter is in progress', async () => {
    const result = await service.complete(doctorClaims, ENCOUNTER_ID, validCompleteDto());

    expect(fhir.batch).toHaveBeenCalledTimes(1);
    const entries = committedEntries(fhir);
    expect(entries[0]?.request).toEqual({ method: 'PUT', url: `Encounter/${ENCOUNTER_ID}`, ifMatch: 'W/"1"' });
    expect(entries[0]?.resource['status']).toBe('finished');
    expect(entries.map((entry) => entry.resource.resourceType)).toEqual([
      'Encounter',
      'Appointment',
      'Condition',
      'ClinicalImpression',
      'CarePlan',
      'Observation',
      'ServiceRequest',
      'MedicationRequest',
      'AuditEvent',
      'AuditEvent',
      'AuditEvent',
    ]);
    expect(result).toMatchObject({ id: ENCOUNTER_ID, status: 'finished', diagnosisCodes: ['J06.9'] });
    expect(result.period.end).toEqual(expect.any(String));
  });

  it('should set the appointment to fulfilled in the same If-Match guarded transaction when the encounter is completed', async () => {
    await service.complete(doctorClaims, ENCOUNTER_ID, validCompleteDto());

    const appointment = committedEntries(fhir).find((entry) => entry.resource.resourceType === 'Appointment');
    expect(appointment?.request).toEqual({ method: 'PUT', url: `Appointment/${APPOINTMENT_ID}`, ifMatch: 'W/"2"' });
    expect(appointment?.resource['status']).toBe('fulfilled');
    expect(fhir.update).not.toHaveBeenCalled();
    expect(fhir.batch).toHaveBeenCalledTimes(1);
  });

  it('should report ENCOUNTER_STATE_INVALID and publish nothing when the appointment changed after it was read', async () => {
    fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir', 412, '{}'));

    expect(await errorPayloadOf(service.complete(doctorClaims, ENCOUNTER_ID, validCompleteDto()))).toMatchObject({
      errorCode: 'ENCOUNTER_STATE_INVALID',
    });
    expect(publisher.publishCompleted).not.toHaveBeenCalled();
  });

  it('should report ENCOUNTER_STATE_INVALID and publish nothing when a concurrent completion wins the If-Match race', async () => {
    fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir', 412, '{}'));

    expect(await errorPayloadOf(service.complete(doctorClaims, ENCOUNTER_ID, validCompleteDto()))).toMatchObject({
      errorCode: 'ENCOUNTER_STATE_INVALID',
    });
    expect(publisher.publishCompleted).not.toHaveBeenCalled();
  });

  it('should publish encounter.completed with the diagnoses when the transaction commits', async () => {
    await service.complete(doctorClaims, ENCOUNTER_ID, validCompleteDto());

    expect(publisher.publishCompleted).toHaveBeenCalledWith({
      encounterId: ENCOUNTER_ID,
      patientRef: 'Patient/pat-1',
      practitionerRef: 'PractitionerRole/role-1',
      diagnoses: [{ code: 'J06.9', display: 'Острая инфекция верхних дыхательных путей' }],
    });
  });

  it('should refuse a non-participant practitioner before revealing the encounter state', async () => {
    fhir.read.mockResolvedValue(finishedEncounter);

    expect(await errorPayloadOf(service.complete(otherDoctorClaims, ENCOUNTER_ID, validCompleteDto()))).toMatchObject({
      errorCode: 'COMPARTMENT_VIOLATION',
    });
    expect(fhir.batch).not.toHaveBeenCalled();
  });

  it('should refuse completion when the appointment was marked as a no-show meanwhile', async () => {
    fhir.read.mockImplementation(async (type) =>
      type === 'Encounter' ? inProgressEncounter : { ...bookedAppointment, status: 'noshow' },
    );

    await expect(service.complete(doctorClaims, ENCOUNTER_ID, validCompleteDto())).rejects.toBeInstanceOf(ConflictException);
    expect(fhir.read).toHaveBeenCalledWith('Appointment', APPOINTMENT_ID);
    expect(fhir.batch).not.toHaveBeenCalled();
  });
});
