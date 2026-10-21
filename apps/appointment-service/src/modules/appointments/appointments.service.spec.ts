import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { AppointmentPublisherService } from '../events/appointment-publisher.service';
import { AppointmentsService } from './appointments.service';

const patientClaims: JwtClaims = {
  sub: 'user-1',
  scope: 'patient/*.write',
  role: 'PATIENT',
  // auth-service issues the SMART launch context as a bare Patient id.
  patient: '9f2c',
  jti: 'jti-1',
};

const freeSlot: FhirResource = {
  resourceType: 'Slot',
  id: 'slot-1',
  status: 'free',
  start: '2026-11-02T09:00:00+03:00',
  end: '2026-11-02T09:30:00+03:00',
  schedule: { reference: 'Schedule/sched-1' },
  meta: { versionId: '3' },
};

const schedule: FhirResource = {
  resourceType: 'Schedule',
  id: 'sched-1',
  actor: [
    { reference: 'PractitionerRole/role-1' },
    { reference: 'Location/room-1' },
    { reference: 'HealthcareService/svc-1' },
  ],
};

const practitionerRole: FhirResource = {
  resourceType: 'PractitionerRole',
  id: 'role-1',
  practitioner: { reference: 'Practitioner/doc-1' },
};

const bookedAppointment: FhirResource = {
  resourceType: 'Appointment',
  id: 'apt-1',
  status: 'booked',
  start: freeSlot['start'],
  end: freeSlot['end'],
  slot: [{ reference: 'Slot/slot-1' }],
  participant: [
    { actor: { reference: 'Patient/9f2c' }, status: 'accepted' },
    { actor: { reference: 'PractitionerRole/role-1' }, status: 'accepted' },
  ],
  meta: { versionId: '2' },
};

/** Error payload (`{ errorCode, message }`) thrown by a service call. */
async function errorPayloadOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return (error as { getResponse(): unknown }).getResponse();
  }
  throw new Error('expected the promise to reject');
}

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let fhir: jest.Mocked<FhirClient>;
  let publisher: jest.Mocked<AppointmentPublisherService>;

  beforeEach(() => {
    fhir = {
      search: jest.fn(),
      read: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      operation: jest.fn(),
      batch: jest.fn(),
    } as unknown as jest.Mocked<FhirClient>;
    publisher = {
      publishBooked: jest.fn().mockResolvedValue(undefined),
      publishCancelled: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AppointmentPublisherService>;
    service = new AppointmentsService(fhir, publisher);
  });

  describe('book', () => {
    it('should commit the slot CAS, the Appointment and the AuditEvent in one transaction, then publish, when the slot is free', async () => {
      fhir.read.mockImplementation(async (type) => (type === 'Slot' ? freeSlot : schedule));
      fhir.batch.mockResolvedValue({
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: [
          { response: { status: '200', location: 'Slot/slot-1/_history/4' } },
          { response: { status: '201', location: 'Appointment/apt-1/_history/1' } },
          { response: { status: '201', location: 'AuditEvent/ae-1/_history/1' } },
        ],
      });

      const result = await service.book(patientClaims, { slotId: 'slot-1' });

      const bundle = fhir.batch.mock.calls[0]?.[0] as unknown as { type: string; entry: Array<{ request: Record<string, unknown> }> };
      expect(bundle.type).toBe('transaction');
      expect(bundle.entry[0]?.request).toEqual({ method: 'PUT', url: 'Slot/slot-1', ifMatch: 'W/"3"' });
      expect(bundle.entry[1]?.request).toEqual({ method: 'POST', url: 'Appointment' });
      expect(bundle.entry[2]?.request).toEqual({ method: 'POST', url: 'AuditEvent' });
      expect(result).toMatchObject({
        patientId: '9f2c',
        id: 'apt-1',
        status: 'booked',
        slotId: 'slot-1',
        serviceId: 'svc-1',
        practitionerRoleId: 'role-1',
      });
      expect(publisher.publishBooked).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: 'apt-1', patientRef: 'Patient/9f2c', slotRef: 'Slot/slot-1' }),
      );
    });

    it('should write a Patient/{id} participant when the token carries a bare patient id', async () => {
      fhir.read.mockImplementation(async (type) => (type === 'Slot' ? freeSlot : schedule));
      fhir.batch.mockResolvedValue({
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: [{}, { response: { status: '201', location: 'Appointment/apt-1/_history/1' } }, {}],
      });

      await service.book(patientClaims, { slotId: 'slot-1' });

      const bundle = fhir.batch.mock.calls[0]?.[0] as unknown as { entry: Array<{ resource: FhirResource }> };
      const participants = bundle.entry[1]?.resource['participant'] as Array<{ actor: { reference: string } }>;
      expect(participants.map((participant) => participant.actor.reference)).toContain('Patient/9f2c');
    });

    it('should answer with the doctor id of the Practitioner behind the role when the booking succeeds', async () => {
      fhir.read.mockImplementation(async (type) => (type === 'Slot' ? freeSlot : type === 'PractitionerRole' ? practitionerRole : schedule));
      fhir.batch.mockResolvedValue({
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: [{}, { response: { status: '201', location: 'Appointment/apt-1/_history/1' } }, {}],
      });

      const result = await service.book(patientClaims, { slotId: 'slot-1' });

      expect(result).toMatchObject({ doctorId: 'doc-1', practitionerRoleId: 'role-1' });
    });

    it('should throw SLOT_CONFLICT without writing when the slot is already busy', async () => {
      fhir.read.mockResolvedValue({ ...freeSlot, status: 'busy' });

      await expect(service.book(patientClaims, { slotId: 'slot-1' })).rejects.toBeInstanceOf(ConflictException);
      expect(await errorPayloadOf(service.book(patientClaims, { slotId: 'slot-1' }))).toMatchObject({
        errorCode: 'SLOT_CONFLICT',
      });
      expect(fhir.batch).not.toHaveBeenCalled();
      expect(publisher.publishBooked).not.toHaveBeenCalled();
    });

    it('should map the lost race to SLOT_CONFLICT and publish nothing when HAPI rejects the If-Match (412 as 409)', async () => {
      fhir.read.mockImplementation(async (type) => (type === 'Slot' ? freeSlot : schedule));
      fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir', 412, '{}'));

      expect(await errorPayloadOf(service.book(patientClaims, { slotId: 'slot-1' }))).toMatchObject({
        errorCode: 'SLOT_CONFLICT',
      });
      expect(publisher.publishBooked).not.toHaveBeenCalled();
    });

    it('should refuse before touching FHIR when the token carries no patient context', async () => {
      const noPatient: JwtClaims = { ...patientClaims, patient: undefined };

      await expect(service.book(noPatient, { slotId: 'slot-1' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(fhir.read).not.toHaveBeenCalled();
    });

    it('should reject with VALIDATION_ERROR when serviceId does not match the slot schedule', async () => {
      fhir.read.mockImplementation(async (type) => (type === 'Slot' ? freeSlot : schedule));

      expect(await errorPayloadOf(service.book(patientClaims, { slotId: 'slot-1', serviceId: 'other' }))).toMatchObject({
        errorCode: 'VALIDATION_ERROR',
      });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should fail with INTERNAL, without reading a collection URL, when the slot has no schedule', async () => {
      const scheduleless = { ...freeSlot, schedule: undefined };
      fhir.read.mockImplementation(async (type) => (type === 'Slot' ? scheduleless : schedule));

      expect(await errorPayloadOf(service.book(patientClaims, { slotId: 'slot-1' }))).toMatchObject({
        errorCode: 'INTERNAL',
      });
      expect(fhir.read).not.toHaveBeenCalledWith('Schedule', '');
      expect(fhir.batch).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('should fail with INTERNAL, without reading a collection URL, when the appointment has no slot', async () => {
      fhir.read.mockResolvedValue({ ...bookedAppointment, slot: undefined });

      expect(await errorPayloadOf(service.cancel(patientClaims, 'apt-1', { reason: 'не смог прийти' }))).toMatchObject({
        errorCode: 'INTERNAL',
      });
      expect(fhir.read).not.toHaveBeenCalledWith('Slot', '');
      expect(fhir.batch).not.toHaveBeenCalled();
      expect(publisher.publishCancelled).not.toHaveBeenCalled();
    });

    it('should refuse with COMPARTMENT_VIOLATION when the appointment belongs to another patient', async () => {
      fhir.read.mockResolvedValue({ ...bookedAppointment, participant: [{ actor: { reference: 'Patient/other' } }] });

      expect(await errorPayloadOf(service.cancel(patientClaims, 'apt-1', { reason: 'не смог прийти' }))).toMatchObject({
        errorCode: 'COMPARTMENT_VIOLATION',
      });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should refuse before reading FHIR when a patient token carries no patient context', async () => {
      fhir.read.mockResolvedValue(bookedAppointment);
      const noPatient: JwtClaims = { ...patientClaims, patient: undefined };

      expect(await errorPayloadOf(service.cancel(noPatient, 'apt-1', { reason: 'не смог прийти' }))).toMatchObject({
        errorCode: 'COMPARTMENT_VIOLATION',
      });
      expect(fhir.read).not.toHaveBeenCalled();
    });

    it('should reject with APPOINTMENT_NOT_CANCELLABLE when the appointment is already cancelled', async () => {
      fhir.read.mockResolvedValue({ ...bookedAppointment, status: 'cancelled' });

      expect(await errorPayloadOf(service.cancel(patientClaims, 'apt-1', { reason: 'не смог прийти' }))).toMatchObject({
        errorCode: 'APPOINTMENT_NOT_CANCELLABLE',
      });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should cancel, free the slot with If-Match and publish when the owner cancels a booked appointment', async () => {
      fhir.read.mockImplementation(async (type) =>
        type === 'Appointment' ? bookedAppointment : { ...freeSlot, status: 'busy' },
      );
      fhir.batch.mockResolvedValue({ resourceType: 'Bundle', type: 'transaction-response', entry: [] });

      const result = await service.cancel(patientClaims, 'apt-1', { reason: 'не смог прийти' });

      const bundle = fhir.batch.mock.calls[0]?.[0] as unknown as { entry: Array<{ resource: FhirResource; request: Record<string, unknown> }> };
      expect(bundle.entry[0]?.request).toEqual({ method: 'PUT', url: 'Appointment/apt-1', ifMatch: 'W/"2"' });
      expect(bundle.entry[1]?.resource['status']).toBe('free');
      expect(bundle.entry[1]?.request).toEqual({ method: 'PUT', url: 'Slot/slot-1', ifMatch: 'W/"3"' });
      expect(result).toMatchObject({ status: 'cancelled', cancelReason: 'не смог прийти' });
      expect(publisher.publishCancelled).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: 'apt-1', actorType: 'PATIENT', patientRef: 'Patient/9f2c' }),
      );
    });
  });

  describe('markNoShow', () => {
    const doctorClaims: JwtClaims = { ...patientClaims, role: 'DOCTOR', sub: 'doc-1', patient: undefined, fhirUser: 'PractitionerRole/role-1' };
    const encounterOf = (status: string): FhirResource => ({ resourceType: 'Encounter', id: 'enc-1', status });

    beforeEach(() => {
      fhir.search.mockResolvedValue({ entry: [] });
    });

    it('should mark noshow and keep the slot busy when the participant doctor calls it', async () => {
      fhir.read.mockResolvedValue(bookedAppointment);
      fhir.batch.mockResolvedValue({ resourceType: 'Bundle', type: 'transaction-response', entry: [] });

      const doctor: JwtClaims = { ...patientClaims, role: 'DOCTOR', sub: 'doc-1', patient: undefined, fhirUser: 'PractitionerRole/role-1' };
      const result = await service.markNoShow(doctor, 'apt-1');

      expect(result.status).toBe('noshow');
      const bundle = fhir.batch.mock.calls[0]?.[0] as unknown as { entry: Array<{ request: Record<string, unknown> }> };
      expect(bundle.entry).toHaveLength(2);
      expect(bundle.entry[0]?.request).toEqual({ method: 'PUT', url: 'Appointment/apt-1', ifMatch: 'W/"2"' });
    });

    it('should refuse with COMPARTMENT_VIOLATION when the practitioner does not participate', async () => {
      fhir.read.mockResolvedValue(bookedAppointment);
      const other: JwtClaims = { ...patientClaims, role: 'DOCTOR', patient: undefined, fhirUser: 'PractitionerRole/role-9' };

      expect(await errorPayloadOf(service.markNoShow(other, 'apt-1'))).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should fail closed before reading FHIR when the token carries no practitioner identity', async () => {
      fhir.read.mockResolvedValue(bookedAppointment);
      const noIdentity: JwtClaims = { ...patientClaims, role: 'DOCTOR', patient: undefined };

      expect(await errorPayloadOf(service.markNoShow(noIdentity, 'apt-1'))).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
      expect(fhir.read).not.toHaveBeenCalled();
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should not reveal the status when another practitioner asks about a non-booked appointment', async () => {
      fhir.read.mockResolvedValue({ ...bookedAppointment, status: 'cancelled' });
      const other: JwtClaims = { ...patientClaims, role: 'DOCTOR', patient: undefined, fhirUser: 'PractitionerRole/role-9' };

      expect(await errorPayloadOf(service.markNoShow(other, 'apt-1'))).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
    });

    it.each(['cancelled', 'noshow', 'fulfilled'])(
      'should reject with 409 ENCOUNTER_STATE_INVALID when the appointment is %s instead of booked',
      async (status) => {
        fhir.read.mockResolvedValue({ ...bookedAppointment, status });

        const failure = service.markNoShow(doctorClaims, 'apt-1');

        await expect(failure).rejects.toBeInstanceOf(ConflictException);
        expect(await errorPayloadOf(service.markNoShow(doctorClaims, 'apt-1'))).toMatchObject({ errorCode: 'ENCOUNTER_STATE_INVALID' });
        expect(fhir.batch).not.toHaveBeenCalled();
      },
    );

    it.each(['in-progress', 'finished'])(
      'should reject with 409 ENCOUNTER_STATE_INVALID and write nothing when a %s encounter exists for the booked appointment',
      async (status) => {
        fhir.read.mockResolvedValue(bookedAppointment);
        fhir.search.mockResolvedValue({ entry: [{ resource: encounterOf(status) }] });

        const payload = await errorPayloadOf(service.markNoShow(doctorClaims, 'apt-1'));

        expect(payload).toMatchObject({ errorCode: 'ENCOUNTER_STATE_INVALID' });
        expect(fhir.batch).not.toHaveBeenCalled();
      },
    );

    it('should look the encounter up through its appointment reference when the no-show is checked', async () => {
      fhir.read.mockResolvedValue(bookedAppointment);
      fhir.batch.mockResolvedValue({ resourceType: 'Bundle', type: 'transaction-response', entry: [] });

      await service.markNoShow(doctorClaims, 'apt-1');

      expect(fhir.search).toHaveBeenCalledWith('Encounter', { appointment: 'Appointment/apt-1', _count: 1 });
    });

    it('should not ask for encounters when another practitioner calls no-show', async () => {
      fhir.read.mockResolvedValue(bookedAppointment);
      const other: JwtClaims = { ...doctorClaims, fhirUser: 'PractitionerRole/role-9' };

      await errorPayloadOf(service.markNoShow(other, 'apt-1'));

      expect(fhir.search).not.toHaveBeenCalled();
    });
  });
});
