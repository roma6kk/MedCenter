import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { AppointmentPublisherService } from '../events/appointment-publisher.service';
import { AppointmentsService } from './appointments.service';

const patientClaims: JwtClaims = {
  sub: 'user-1',
  scope: 'patient/*.write',
  role: 'PATIENT',
  patient: 'Patient/9f2c',
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
    it('commits the slot lock, the Appointment and AuditEvent in one transaction, then publishes', async () => {
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

    it('throws SLOT_CONFLICT without writing when the slot is already busy', async () => {
      fhir.read.mockResolvedValue({ ...freeSlot, status: 'busy' });

      await expect(service.book(patientClaims, { slotId: 'slot-1' })).rejects.toBeInstanceOf(ConflictException);
      expect(await errorPayloadOf(service.book(patientClaims, { slotId: 'slot-1' }))).toMatchObject({
        errorCode: 'SLOT_CONFLICT',
      });
      expect(fhir.batch).not.toHaveBeenCalled();
      expect(publisher.publishBooked).not.toHaveBeenCalled();
    });

    it('maps a lost race (HAPI 412 surfacing as 409) to SLOT_CONFLICT and publishes nothing', async () => {
      fhir.read.mockImplementation(async (type) => (type === 'Slot' ? freeSlot : schedule));
      fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir', 412, '{}'));

      expect(await errorPayloadOf(service.book(patientClaims, { slotId: 'slot-1' }))).toMatchObject({
        errorCode: 'SLOT_CONFLICT',
      });
      expect(publisher.publishBooked).not.toHaveBeenCalled();
    });

    it('rejects a token without patient context before touching FHIR', async () => {
      const noPatient: JwtClaims = { ...patientClaims, patient: undefined };

      await expect(service.book(noPatient, { slotId: 'slot-1' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(fhir.read).not.toHaveBeenCalled();
    });

    it('rejects a serviceId that does not match the slot schedule', async () => {
      fhir.read.mockImplementation(async (type) => (type === 'Slot' ? freeSlot : schedule));

      expect(await errorPayloadOf(service.book(patientClaims, { slotId: 'slot-1', serviceId: 'other' }))).toMatchObject({
        errorCode: 'VALIDATION_ERROR',
      });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('fails with INTERNAL, without reading a collection URL, when the slot has no schedule', async () => {
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
    it('fails with INTERNAL, without reading a collection URL, when the appointment has no slot', async () => {
      fhir.read.mockResolvedValue({ ...bookedAppointment, slot: undefined });

      expect(await errorPayloadOf(service.cancel(patientClaims, 'apt-1', { reason: 'не смог прийти' }))).toMatchObject({
        errorCode: 'INTERNAL',
      });
      expect(fhir.read).not.toHaveBeenCalledWith('Slot', '');
      expect(fhir.batch).not.toHaveBeenCalled();
      expect(publisher.publishCancelled).not.toHaveBeenCalled();
    });

    it('refuses to cancel an appointment that belongs to another patient (COMPARTMENT_VIOLATION)', async () => {
      fhir.read.mockResolvedValue({ ...bookedAppointment, participant: [{ actor: { reference: 'Patient/other' } }] });

      expect(await errorPayloadOf(service.cancel(patientClaims, 'apt-1', { reason: 'не смог прийти' }))).toMatchObject({
        errorCode: 'COMPARTMENT_VIOLATION',
      });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('rejects a second cancellation with APPOINTMENT_NOT_CANCELLABLE', async () => {
      fhir.read.mockResolvedValue({ ...bookedAppointment, status: 'cancelled' });

      expect(await errorPayloadOf(service.cancel(patientClaims, 'apt-1', { reason: 'не смог прийти' }))).toMatchObject({
        errorCode: 'APPOINTMENT_NOT_CANCELLABLE',
      });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it("cancels the owner's booked appointment, frees the slot with ifMatch, and publishes", async () => {
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
    it('marks a booked appointment as noshow and keeps the slot busy', async () => {
      fhir.read.mockResolvedValue(bookedAppointment);
      fhir.batch.mockResolvedValue({ resourceType: 'Bundle', type: 'transaction-response', entry: [] });

      const doctor: JwtClaims = { ...patientClaims, role: 'DOCTOR', sub: 'doc-1', patient: undefined, fhirUser: 'PractitionerRole/role-1' };
      const result = await service.markNoShow(doctor, 'apt-1');

      expect(result.status).toBe('noshow');
      const bundle = fhir.batch.mock.calls[0]?.[0] as unknown as { entry: Array<{ request: Record<string, unknown> }> };
      expect(bundle.entry).toHaveLength(2);
      expect(bundle.entry[0]?.request).toEqual({ method: 'PUT', url: 'Appointment/apt-1', ifMatch: 'W/"2"' });
    });

    it('refuses a no-show from a practitioner who does not participate (COMPARTMENT_VIOLATION)', async () => {
      fhir.read.mockResolvedValue(bookedAppointment);
      const other: JwtClaims = { ...patientClaims, role: 'DOCTOR', patient: undefined, fhirUser: 'PractitionerRole/role-9' };

      expect(await errorPayloadOf(service.markNoShow(other, 'apt-1'))).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('fails closed when the token carries no practitioner identity', async () => {
      fhir.read.mockResolvedValue(bookedAppointment);
      const noIdentity: JwtClaims = { ...patientClaims, role: 'DOCTOR', patient: undefined };

      expect(await errorPayloadOf(service.markNoShow(noIdentity, 'apt-1'))).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it("does not reveal another practitioner's appointment status", async () => {
      fhir.read.mockResolvedValue({ ...bookedAppointment, status: 'cancelled' });
      const other: JwtClaims = { ...patientClaims, role: 'DOCTOR', patient: undefined, fhirUser: 'PractitionerRole/role-9' };

      expect(await errorPayloadOf(service.markNoShow(other, 'apt-1'))).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
    });

    it('refuses a no-show for an appointment that is not booked', async () => {
      fhir.read.mockResolvedValue({ ...bookedAppointment, status: 'cancelled' });

      const doctor: JwtClaims = { ...patientClaims, role: 'DOCTOR', patient: undefined, fhirUser: 'PractitionerRole/role-1' };

      await expect(service.markNoShow(doctor, 'apt-1')).rejects.toBeInstanceOf(ConflictException);
      expect(fhir.batch).not.toHaveBeenCalled();
    });
  });
});
