import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { APPOINTMENT_CANCEL_REASON_SYSTEM, Role, type ErrorCode } from '@medcenter/contracts';
import {
  commitTransaction,
  FHIR_CLIENT,
  outboxWrite,
  versionOf,
  type FhirClient,
  type FhirResource,
} from '@medcenter/fhir';
import { toAppointmentResponseDto, type AppointmentResponseDto } from '@medcenter/fhir-mappers';

import { bookedEvent, cancelledEvent, noshowEvent } from '../events/appointment-events';
import {
  BOOKED,
  buildBookedAppointment,
  missingReference,
  rolePractitionerId,
  scheduleActorId,
  stringOf,
  type BookableSlot,
} from './appointment-resource';
import { auditWrite } from './audit';
import { assertDoctorParticipates, assertPatientOwns, patientRefOf, requireDoctorRoleRef, slotIdOf } from './compartment';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { referenceId, requirePatientReference } from './fhir-reference';

interface OccupiedSlot {
  readonly slotId: string;
  readonly slot: FhirResource;
}

function assertBooked(appointment: FhirResource, errorCode: ErrorCode, action: string): void {
  if (appointment['status'] !== BOOKED) {
    throw new ConflictException({ errorCode, message: `${errorCode}: only booked appointments can be ${action}` });
  }
}

function assertOffered(resource: FhirResource): void {
  if (resource['active'] === false) {
    throw new ConflictException({ errorCode: 'SLOT_CONFLICT', message: 'SLOT_CONFLICT: the slot is no longer offered' });
  }
}

function assertStarted(appointment: FhirResource): void {
  if (Date.parse(stringOf(appointment, 'start')) > Date.now()) {
    throw new ConflictException({
      errorCode: 'ENCOUNTER_STATE_INVALID',
      message: 'ENCOUNTER_STATE_INVALID: the appointment has not started yet, a no-show can be recorded once its time has come',
    });
  }
}

/** `409 SLOT_CONFLICT` once the slot has started: an unbooked slot stays `free` for good and its id is computable. */
function assertNotStarted(slot: FhirResource, slotId: string): void {
  const startMs = Date.parse(stringOf(slot, 'start'));
  if (Number.isNaN(startMs)) {
    throw new InternalServerErrorException({ errorCode: 'INTERNAL', message: `INTERNAL: Slot ${slotId} has no valid start` });
  }
  if (startMs <= Date.now()) {
    throw new ConflictException({ errorCode: 'SLOT_CONFLICT', message: 'SLOT_CONFLICT: slot has already started' });
  }
}

/** Booking races are settled by optimistic locking: the Slot/Appointment write carries `ifMatch` on the version read, in one HAPI transaction; the loser gets 409. */
@Injectable()
export class AppointmentsService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  async book(claims: JwtClaims, dto: CreateAppointmentDto, requestId?: string): Promise<AppointmentResponseDto> {
    const patientRef = requirePatientReference(claims);
    const bookable = await this.loadBookableSlot(dto);
    // Client-assigned id: the outbox event in the same transaction names the appointment before HAPI could assign one.
    const appointmentId = randomUUID();
    const appointment: FhirResource = { ...buildBookedAppointment(bookable, patientRef), id: appointmentId };
    const { slot, slotId, practitionerRoleId, serviceId } = bookable;
    const audit = { interaction: 'create', actorSub: claims.sub, entityRef: `Appointment/${appointmentId}`, patientRef, requestId } as const;
    const event = bookedEvent({
      appointmentId,
      patientRef,
      practitionerRoleRef: `PractitionerRole/${practitionerRoleId}`,
      slotRef: `Slot/${slotId}`,
      start: stringOf(appointment, 'start'),
      serviceId,
    });

    await commitTransaction(
      this.fhir,
      [
        { method: 'PUT', url: `Slot/${slotId}`, resource: { ...slot, status: 'busy' }, ifMatch: versionOf(slot) },
        { method: 'PUT', url: `Appointment/${appointmentId}`, resource: appointment },
        auditWrite(audit),
        outboxWrite(event),
      ],
      'SLOT_CONFLICT',
    );
    return toAppointmentResponseDto(appointment);
  }

  async cancel(
    claims: JwtClaims,
    appointmentId: string,
    dto: CancelAppointmentDto,
    requestId?: string,
  ): Promise<AppointmentResponseDto> {
    const appointment = await this.readCancellable(claims, appointmentId);
    const { slotId, slot } = await this.readSlotOf(appointment, appointmentId);
    const cancelled: FhirResource = { ...appointment, status: 'cancelled', cancelationReason: { coding: [{ system: APPOINTMENT_CANCEL_REASON_SYSTEM, code: dto.reason }] } };
    const patientRef = patientRefOf(appointment);
    const actorType = claims.role === Role.ADMIN ? 'ADMIN' : 'PATIENT';
    await commitTransaction(
      this.fhir,
      [
        { method: 'PUT', url: `Appointment/${appointmentId}`, resource: cancelled, ifMatch: versionOf(appointment) },
        { method: 'PUT', url: `Slot/${slotId}`, resource: { ...slot, status: 'free' }, ifMatch: versionOf(slot) },
        auditWrite({ interaction: 'update', actorSub: claims.sub, entityRef: `Appointment/${appointmentId}`, patientRef, requestId }),
        outboxWrite(cancelledEvent({ appointmentId, patientRef: patientRef ?? '', actorType })),
      ],
      'APPOINTMENT_NOT_CANCELLABLE',
    );
    return toAppointmentResponseDto(cancelled);
  }

  private async readCancellable(claims: JwtClaims, appointmentId: string): Promise<FhirResource> {
    // Fail closed before HAPI: a patient token without a compartment never triggers a read.
    const callerRef = claims.role === Role.ADMIN ? undefined : requirePatientReference(claims);
    const appointment = await this.fhir.read('Appointment', appointmentId);
    if (callerRef !== undefined) {
      // Ownership before state: another patient must not learn the appointment's status.
      assertPatientOwns(callerRef, appointment);
    }
    assertBooked(appointment, 'APPOINTMENT_NOT_CANCELLABLE', 'cancelled');
    if (callerRef !== undefined && Date.parse(stringOf(appointment, 'start')) <= Date.now()) {
      throw new ConflictException({
        errorCode: 'APPOINTMENT_ALREADY_STARTED',
        message: 'APPOINTMENT_ALREADY_STARTED: a started appointment can only be cancelled by an administrator',
      });
    }
    // A patient who is being seen (an encounter exists) cannot cancel; an encounter opened after this check bumps the version.
    await this.assertNoEncounter(appointmentId, 'APPOINTMENT_NOT_CANCELLABLE', 'cancelled');
    return appointment;
  }

  async markNoShow(claims: JwtClaims, appointmentId: string, requestId?: string): Promise<AppointmentResponseDto> {
    const callerRef = requireDoctorRoleRef(claims);
    const appointment = await this.fhir.read('Appointment', appointmentId);
    // Ownership before state: a non-participant must not learn the appointment's status.
    assertDoctorParticipates(callerRef, appointment);
    assertBooked(appointment, 'ENCOUNTER_STATE_INVALID', 'marked as no-show');
    await this.assertNoEncounter(appointmentId, 'ENCOUNTER_STATE_INVALID', 'marked as no-show (BR-008)');
    assertStarted(appointment);

    const updated: FhirResource = { ...appointment, status: 'noshow' };
    const patientRef = patientRefOf(appointment);
    await commitTransaction(
      this.fhir,
      [
        { method: 'PUT', url: `Appointment/${appointmentId}`, resource: updated, ifMatch: versionOf(appointment) },
        auditWrite({ interaction: 'update', actorSub: claims.sub, entityRef: `Appointment/${appointmentId}`, patientRef, requestId }),
        outboxWrite(noshowEvent({ appointmentId, patientRef: patientRef ?? '' })),
      ],
      'ENCOUNTER_STATE_INVALID',
    );
    return toAppointmentResponseDto(updated);
  }

  /** An encounter opened after the search is caught by `If-Match` on the Appointment (encounter-service changes its `meta.tag`). */
  private async assertNoEncounter(appointmentId: string, errorCode: ErrorCode, action: string): Promise<void> {
    const encounters = await this.fhir.search('Encounter', { appointment: `Appointment/${appointmentId}`, _count: 1 });
    if ((encounters.entry ?? []).length > 0) {
      throw new ConflictException({
        errorCode,
        message: `${errorCode}: the appointment already has an encounter, it cannot be ${action}`,
      });
    }
  }

  private async readSlotOf(appointment: FhirResource, appointmentId: string): Promise<OccupiedSlot> {
    const slotId = slotIdOf(appointment);
    if (slotId === '') {
      throw missingReference(`Appointment ${appointmentId} has no slot`);
    }
    return { slotId, slot: await this.fhir.read('Slot', slotId) };
  }

  private async loadBookableSlot(dto: CreateAppointmentDto): Promise<BookableSlot> {
    const slot = await this.fhir.read('Slot', dto.slotId);
    if (slot['status'] !== 'free') {
      throw new ConflictException({ errorCode: 'SLOT_CONFLICT', message: 'SLOT_CONFLICT: slot is not free' });
    }
    assertNotStarted(slot, dto.slotId);
    const scheduleId = referenceId((slot['schedule'] as { reference?: unknown } | undefined)?.reference);
    if (scheduleId === '') {
      throw missingReference(`Slot ${dto.slotId} has no schedule`);
    }
    const schedule = await this.fhir.read('Schedule', scheduleId);
    assertOffered(schedule);
    const practitionerRoleId = scheduleActorId(schedule, 'PractitionerRole');
    const serviceId = scheduleActorId(schedule, 'HealthcareService');
    if (practitionerRoleId === '' || serviceId === '') {
      throw new InternalServerErrorException({ errorCode: 'INTERNAL', message: 'Schedule is missing its practitioner role or service' });
    }
    if (dto.serviceId !== undefined && dto.serviceId !== serviceId) {
      throw new BadRequestException({ errorCode: 'VALIDATION_ERROR', message: 'serviceId does not match the schedule of this slot' });
    }
    const role = await this.fhir.read('PractitionerRole', practitionerRoleId);
    assertOffered(role);
    return { slotId: dto.slotId, slot, practitionerRoleId, practitionerId: rolePractitionerId(role), serviceId };
  }
}
