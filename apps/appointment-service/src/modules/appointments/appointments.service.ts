import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { requirePatientRef, type JwtClaims } from '@medcenter/common';
import { Role } from '@medcenter/contracts';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { toAppointmentResponseDto, type AppointmentResponseDto } from '@medcenter/fhir-mappers';

import { AppointmentPublisherService } from '../events/appointment-publisher.service';
import { buildAuditEvent } from './audit';
import { assertDoctorParticipates, assertPatientOwns, patientRefOf, slotIdOf } from './compartment';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import {
  commitTransaction,
  idFromLocation,
  referenceId,
  versionOf,
  type TransactionWrite,
} from './fhir-transaction';

const BOOKED = 'booked';

function stringOf(resource: FhirResource, key: string): string {
  const value = resource[key];
  return typeof value === 'string' ? value : '';
}

/** `Schedule.actor` entry of the given resource type, as a bare id. */
function scheduleActorId(schedule: FhirResource, resourceType: string): string {
  const actors = (schedule['actor'] as Array<{ reference?: unknown }> | undefined) ?? [];
  const reference = actors
    .map((actor) => actor.reference)
    .find((ref): ref is string => typeof ref === 'string' && ref.startsWith(`${resourceType}/`));
  return referenceId(reference);
}

/**
 * Booking lifecycle (FR-004/005/006, BR-001/002, ADR-012).
 *
 * Concurrency: the Slot write carries an `ifMatch` on the version that was read,
 * and it is committed in the same transaction as the Appointment. Two requests
 * that race for one slot both read the same version; only one commit succeeds,
 * and the other receives `409 SLOT_CONFLICT`. HAPI has no row locks over REST,
 * so this optimistic check replaces the pessimistic lock described in ADR-012.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    private readonly events: AppointmentPublisherService,
  ) {}

  async book(claims: JwtClaims, dto: CreateAppointmentDto): Promise<AppointmentResponseDto> {
    const patientRef = requirePatientRef(claims);
    const slot = await this.fhir.read('Slot', dto.slotId);
    if (slot['status'] !== 'free') {
      throw this.slotConflict();
    }

    const scheduleId = referenceId((slot['schedule'] as { reference?: unknown })?.reference);
    if (scheduleId === '') {
      throw this.missingReference(`Slot ${dto.slotId} has no schedule`);
    }
    const schedule = await this.fhir.read('Schedule', scheduleId);
    const practitionerRoleId = scheduleActorId(schedule, 'PractitionerRole');
    const scheduleServiceId = scheduleActorId(schedule, 'HealthcareService');
    if (practitionerRoleId === '' || scheduleServiceId === '') {
      throw new InternalServerErrorException({
        errorCode: 'INTERNAL',
        message: 'Schedule is missing its practitioner role or service',
      });
    }
    if (dto.serviceId !== undefined && dto.serviceId !== scheduleServiceId) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'serviceId does not match the schedule of this slot',
      });
    }

    const appointmentRef = `urn:uuid:${randomUUID()}`;
    const appointment: FhirResource = {
      resourceType: 'Appointment',
      status: BOOKED,
      start: stringOf(slot, 'start'),
      end: stringOf(slot, 'end'),
      created: new Date().toISOString().slice(0, 10),
      slot: [{ reference: `Slot/${dto.slotId}` }],
      participant: [
        { actor: { reference: patientRef }, status: 'accepted' },
        { actor: { reference: `PractitionerRole/${practitionerRoleId}` }, status: 'accepted' },
        { actor: { reference: `HealthcareService/${scheduleServiceId}` }, status: 'accepted' },
      ],
      ...(dto.reason === undefined ? {} : { reasonCode: [{ text: dto.reason }] }),
    };

    const writes: TransactionWrite[] = [
      { method: 'PUT', url: `Slot/${dto.slotId}`, resource: { ...slot, status: 'busy' }, ifMatch: versionOf(slot) },
      { method: 'POST', url: 'Appointment', fullUrl: appointmentRef, resource: appointment },
      {
        method: 'POST',
        url: 'AuditEvent',
        resource: buildAuditEvent({ action: 'C', subtype: 'create', actorSub: claims.sub, entityRef: appointmentRef }),
      },
    ];
    const response = await commitTransaction(this.fhir, writes, 'SLOT_CONFLICT');

    const entries = (response['entry'] as Array<{ response?: { location?: string } }> | undefined) ?? [];
    const appointmentId = idFromLocation(entries[1]?.response?.location);
    if (appointmentId === '') {
      throw new InternalServerErrorException({ errorCode: 'INTERNAL', message: 'Transaction response has no Appointment id' });
    }

    await this.events.publishBooked({
      appointmentId,
      patientRef,
      practitionerRoleRef: `PractitionerRole/${practitionerRoleId}`,
      slotRef: `Slot/${dto.slotId}`,
      start: stringOf(appointment, 'start'),
      serviceId: scheduleServiceId,
    });

    return toAppointmentResponseDto({ ...appointment, id: appointmentId });
  }

  /** Patient (own appointments) or ADMIN cancels a booked appointment; the slot becomes `free` again. */
  async cancel(claims: JwtClaims, appointmentId: string, dto: CancelAppointmentDto): Promise<AppointmentResponseDto> {
    const appointment = await this.fhir.read('Appointment', appointmentId);
    const isAdmin = claims.role === Role.ADMIN;
    if (!isAdmin) {
      assertPatientOwns(claims, appointment);
    }
    if (appointment['status'] !== BOOKED) {
      throw new ConflictException({
        errorCode: 'APPOINTMENT_NOT_CANCELLABLE',
        message: 'APPOINTMENT_NOT_CANCELLABLE: only booked appointments can be cancelled',
      });
    }

    const slotId = slotIdOf(appointment);
    if (slotId === '') {
      throw this.missingReference(`Appointment ${appointmentId} has no slot`);
    }
    const slot = await this.fhir.read('Slot', slotId);
    const cancelled: FhirResource = {
      ...appointment,
      status: 'cancelled',
      cancelationReason: { text: dto.reason },
    };
    await commitTransaction(
      this.fhir,
      [
        { method: 'PUT', url: `Appointment/${appointmentId}`, resource: cancelled, ifMatch: versionOf(appointment) },
        { method: 'PUT', url: `Slot/${slotId}`, resource: { ...slot, status: 'free' }, ifMatch: versionOf(slot) },
        {
          method: 'POST',
          url: 'AuditEvent',
          resource: buildAuditEvent({ action: 'U', subtype: 'update', actorSub: claims.sub, entityRef: `Appointment/${appointmentId}` }),
        },
      ],
      'APPOINTMENT_NOT_CANCELLABLE',
    );

    await this.events.publishCancelled({
      appointmentId,
      patientRef: patientRefOf(appointment) ?? '',
      reason: dto.reason,
      actorType: isAdmin ? 'ADMIN' : 'PATIENT',
    });
    return toAppointmentResponseDto(cancelled);
  }

  /**
   * Doctor marks a booked appointment as a no-show (API §6.6). The slot stays
   * `busy`: the time has passed and cannot be booked again.
   */
  async markNoShow(claims: JwtClaims, appointmentId: string): Promise<AppointmentResponseDto> {
    const appointment = await this.fhir.read('Appointment', appointmentId);
    // Ownership before state: a non-participant must not learn the appointment's status.
    assertDoctorParticipates(claims, appointment);
    if (appointment['status'] !== BOOKED) {
      throw new ConflictException({
        errorCode: 'CONFLICT',
        message: 'CONFLICT: only booked appointments can be marked as no-show',
      });
    }
    const updated: FhirResource = { ...appointment, status: 'noshow' };
    await commitTransaction(
      this.fhir,
      [
        { method: 'PUT', url: `Appointment/${appointmentId}`, resource: updated, ifMatch: versionOf(appointment) },
        {
          method: 'POST',
          url: 'AuditEvent',
          resource: buildAuditEvent({ action: 'U', subtype: 'update', actorSub: claims.sub, entityRef: `Appointment/${appointmentId}` }),
        },
      ],
      'CONFLICT',
    );
    return toAppointmentResponseDto(updated);
  }

  private slotConflict(): ConflictException {
    return new ConflictException({ errorCode: 'SLOT_CONFLICT', message: 'SLOT_CONFLICT: slot is not free' });
  }

  /**
   * A stored resource lacks a reference the write path needs. An empty id would
   * otherwise turn into a `GET Slot/` (or `Schedule/`) collection request, so it
   * fails here as an internal data error instead.
   */
  private missingReference(detail: string): InternalServerErrorException {
    return new InternalServerErrorException({ errorCode: 'INTERNAL', message: `INTERNAL: ${detail}` });
  }
}
