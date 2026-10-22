import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { Role, type ErrorCode } from '@medcenter/contracts';
import { assertActiveConsent, findActiveConsent, FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { toAppointmentResponseDto, type AppointmentResponseDto } from '@medcenter/fhir-mappers';

import { AppointmentPublisherService } from '../events/appointment-publisher.service';
import {
  BOOKED,
  buildBookedAppointment,
  createdAppointmentId,
  missingReference,
  rolePractitionerId,
  scheduleActorId,
  stringOf,
  type BookableSlot,
} from './appointment-resource';
import { auditWrite } from './audit';
import { CONSENT_ENFORCEMENT_MODE, type ConsentEnforcement } from './consent-enforcement';
import { assertDoctorParticipates, assertPatientOwns, patientRefOf, requireDoctorRoleRef, slotIdOf } from './compartment';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { requirePatientReference } from './fhir-reference';
import { commitTransaction, referenceId, versionOf } from './fhir-transaction';

/** The Slot a booked Appointment holds, with the id it is addressed by. */
interface OccupiedSlot {
  readonly slotId: string;
  readonly slot: FhirResource;
}

/** `409 <code>` unless the appointment is still `booked` (BR-002, API §6.4/6.6). */
function assertBooked(appointment: FhirResource, errorCode: ErrorCode, action: string): void {
  if (appointment['status'] !== BOOKED) {
    throw new ConflictException({ errorCode, message: `${errorCode}: only booked appointments can be ${action}` });
  }
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
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    private readonly events: AppointmentPublisherService,
    @Inject(CONSENT_ENFORCEMENT_MODE) private readonly consentEnforcement: ConsentEnforcement,
  ) {}

  /** `requestId` is the `X-Request-Id` recorded in the AuditEvent (NFR-007). */
  async book(claims: JwtClaims, dto: CreateAppointmentDto, requestId?: string): Promise<AppointmentResponseDto> {
    // `Patient/{id}`: the token carries a bare id, the Appointment needs a reference.
    const patientRef = requirePatientReference(claims);
    const reason = await this.reasonAllowedByConsent(patientRef, dto.reason);
    const bookable = await this.loadBookableSlot(dto);
    const appointmentRef = `urn:uuid:${randomUUID()}`;
    const appointment = buildBookedAppointment(bookable, patientRef, reason);
    const { slot, slotId, practitionerRoleId, serviceId } = bookable;
    const audit = { interaction: 'create', actorSub: claims.sub, entityRef: appointmentRef, patientRef, requestId } as const;

    const response = await commitTransaction(
      this.fhir,
      [
        { method: 'PUT', url: `Slot/${slotId}`, resource: { ...slot, status: 'busy' }, ifMatch: versionOf(slot) },
        { method: 'POST', url: 'Appointment', fullUrl: appointmentRef, resource: appointment },
        auditWrite(audit),
      ],
      'SLOT_CONFLICT',
    );
    const appointmentId = createdAppointmentId(response);

    await this.events.publishBooked({
      appointmentId,
      patientRef,
      practitionerRoleRef: `PractitionerRole/${practitionerRoleId}`,
      slotRef: `Slot/${slotId}`,
      start: stringOf(appointment, 'start'),
      serviceId,
    });
    return toAppointmentResponseDto({ ...appointment, id: appointmentId });
  }

  /**
   * ADR-019: booking itself needs no consent, but a free-text reason is health data. Without a consent
   * in force `block` answers `409 CONSENT_REQUIRED`; `warn` books without the reason and logs it.
   */
  private async reasonAllowedByConsent(patientRef: string, reason: string | undefined): Promise<string | undefined> {
    if (reason === undefined) {
      return undefined;
    }
    const patientId = patientRef.split('/')[1] ?? '';
    if (this.consentEnforcement === 'block') {
      await assertActiveConsent(this.fhir, patientId);
      return reason;
    }
    if ((await findActiveConsent(this.fhir, patientId)) === null) {
      this.logger.warn({ patientId }, 'free-text reason dropped: the patient has no active consent (CONSENT_ENFORCEMENT=warn)');
      return undefined;
    }
    return reason;
  }

  /** Patient (own appointments) or ADMIN cancels a booked appointment; the slot becomes `free` again. */
  async cancel(
    claims: JwtClaims,
    appointmentId: string,
    dto: CancelAppointmentDto,
    requestId?: string,
  ): Promise<AppointmentResponseDto> {
    const appointment = await this.readCancellable(claims, appointmentId);
    const { slotId, slot } = await this.readSlotOf(appointment, appointmentId);
    const cancelled: FhirResource = { ...appointment, status: 'cancelled', cancelationReason: { text: dto.reason } };
    const patientRef = patientRefOf(appointment);
    await commitTransaction(
      this.fhir,
      [
        { method: 'PUT', url: `Appointment/${appointmentId}`, resource: cancelled, ifMatch: versionOf(appointment) },
        { method: 'PUT', url: `Slot/${slotId}`, resource: { ...slot, status: 'free' }, ifMatch: versionOf(slot) },
        auditWrite({ interaction: 'update', actorSub: claims.sub, entityRef: `Appointment/${appointmentId}`, patientRef, requestId }),
      ],
      'APPOINTMENT_NOT_CANCELLABLE',
    );

    const actorType = claims.role === Role.ADMIN ? 'ADMIN' : 'PATIENT';
    await this.events.publishCancelled({ appointmentId, patientRef: patientRef ?? '', reason: dto.reason, actorType });
    return toAppointmentResponseDto(cancelled);
  }

  /** The appointment the caller may cancel (BR-002): own for a patient, any for an admin, and still `booked`. */
  private async readCancellable(claims: JwtClaims, appointmentId: string): Promise<FhirResource> {
    // Fail closed before HAPI: a patient token without a compartment never triggers a read.
    const callerRef = claims.role === Role.ADMIN ? undefined : requirePatientReference(claims);
    const appointment = await this.fhir.read('Appointment', appointmentId);
    if (callerRef !== undefined) {
      // Ownership before state: another patient must not learn the appointment's status.
      assertPatientOwns(callerRef, appointment);
    }
    assertBooked(appointment, 'APPOINTMENT_NOT_CANCELLABLE', 'cancelled');
    return appointment;
  }

  /**
   * Doctor marks a booked appointment as a no-show (API §6.6). The slot stays
   * `busy`: the time has passed and cannot be booked again. BR-008: only an
   * appointment that is still `booked` and has no encounter yet can be a
   * no-show, otherwise `409 ENCOUNTER_STATE_INVALID` — a patient who was seen
   * (an in-progress or finished encounter, a `fulfilled` appointment) did show up.
   */
  async markNoShow(claims: JwtClaims, appointmentId: string, requestId?: string): Promise<AppointmentResponseDto> {
    // Fail closed before HAPI: a token without `fhirUser = PractitionerRole/{id}` never triggers a read.
    const callerRef = requireDoctorRoleRef(claims);
    const appointment = await this.fhir.read('Appointment', appointmentId);
    // Ownership before state: a non-participant must not learn the appointment's status.
    assertDoctorParticipates(callerRef, appointment);
    assertBooked(appointment, 'ENCOUNTER_STATE_INVALID', 'marked as no-show');
    await this.assertNoEncounter(appointmentId);

    const updated: FhirResource = { ...appointment, status: 'noshow' };
    const patientRef = patientRefOf(appointment);
    await commitTransaction(
      this.fhir,
      [
        { method: 'PUT', url: `Appointment/${appointmentId}`, resource: updated, ifMatch: versionOf(appointment) },
        auditWrite({ interaction: 'update', actorSub: claims.sub, entityRef: `Appointment/${appointmentId}`, patientRef, requestId }),
      ],
      'CONFLICT',
    );
    return toAppointmentResponseDto(updated);
  }

  /**
   * `409 ENCOUNTER_STATE_INVALID` when an Encounter (in progress or finished) refers to the appointment.
   * The `If-Match` on the Appointment cannot cover this check: opening an encounter does not change the
   * appointment, so an encounter opened in the instant between this search and the commit is not seen
   * here — completing it is still refused later, because the appointment is no longer `booked`.
   */
  private async assertNoEncounter(appointmentId: string): Promise<void> {
    const encounters = await this.fhir.search('Encounter', { appointment: `Appointment/${appointmentId}`, _count: 1 });
    if ((encounters.entry ?? []).length > 0) {
      throw new ConflictException({
        errorCode: 'ENCOUNTER_STATE_INVALID',
        message: 'ENCOUNTER_STATE_INVALID: the appointment already has an encounter, it cannot be marked as no-show (BR-008)',
      });
    }
  }

  /** The Slot an Appointment occupies; a stored Appointment without one is an internal data error. */
  private async readSlotOf(appointment: FhirResource, appointmentId: string): Promise<OccupiedSlot> {
    const slotId = slotIdOf(appointment);
    if (slotId === '') {
      // An empty id would otherwise become a `GET Slot/` collection request.
      throw missingReference(`Appointment ${appointmentId} has no slot`);
    }
    return { slotId, slot: await this.fhir.read('Slot', slotId) };
  }

  /** Reads the Slot and its Schedule; the slot must be `free` and match a requested service. */
  private async loadBookableSlot(dto: CreateAppointmentDto): Promise<BookableSlot> {
    const slot = await this.fhir.read('Slot', dto.slotId);
    if (slot['status'] !== 'free') {
      throw new ConflictException({ errorCode: 'SLOT_CONFLICT', message: 'SLOT_CONFLICT: slot is not free' });
    }
    const scheduleId = referenceId((slot['schedule'] as { reference?: unknown } | undefined)?.reference);
    if (scheduleId === '') {
      throw missingReference(`Slot ${dto.slotId} has no schedule`);
    }
    const schedule = await this.fhir.read('Schedule', scheduleId);
    const practitionerRoleId = scheduleActorId(schedule, 'PractitionerRole');
    const serviceId = scheduleActorId(schedule, 'HealthcareService');
    if (practitionerRoleId === '' || serviceId === '') {
      throw new InternalServerErrorException({ errorCode: 'INTERNAL', message: 'Schedule is missing its practitioner role or service' });
    }
    if (dto.serviceId !== undefined && dto.serviceId !== serviceId) {
      throw new BadRequestException({ errorCode: 'VALIDATION_ERROR', message: 'serviceId does not match the schedule of this slot' });
    }
    const role = await this.fhir.read('PractitionerRole', practitionerRoleId);
    return { slotId: dto.slotId, slot, practitionerRoleId, practitionerId: rolePractitionerId(role), serviceId };
  }
}
