import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { buildPaginatedResponse, type PaginatedResponseDto } from '@medcenter/contracts';
import { FHIR_CLIENT, type FhirClient, type FhirSearchResult } from '@medcenter/fhir';

import { APPOINTMENT_INCLUDES, appointmentsOf, indexIncluded, toAppointmentView } from './appointment-view.mapper';
import { assertViewerCanSee, requireDoctorRoleRef, resolveViewer } from './compartment';
import type { AppointmentViewDto } from './dto/appointment-view.dto';
import { requirePatientReference } from './fhir-reference';

/** Paging and ordering of a listing (API §0); defaults are applied by the controller. */
export interface PageQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sortOrder: 'asc' | 'desc';
}

/** API §6.2 — `upcoming` keeps appointments that start now or later; `status` keeps any of the listed statuses. */
export interface PatientListQuery extends PageQuery {
  readonly upcoming: boolean;
  readonly status?: readonly string[];
}

/** API §6.5 — inclusive `Appointment.start` range (RFC 3339 date or date-time). */
export interface DoctorListQuery extends PageQuery {
  readonly from?: string;
  readonly to?: string;
}

export type AppointmentPage = PaginatedResponseDto<AppointmentViewDto>;

/** FHIR paging, ordering by `Appointment.start` (`date`) and the display-name includes. */
function searchParams(query: PageQuery): Record<string, unknown> {
  return {
    _sort: query.sortOrder === 'desc' ? '-date' : 'date',
    _count: query.pageSize,
    _offset: (query.page - 1) * query.pageSize,
    _total: 'accurate',
    ...APPOINTMENT_INCLUDES,
  };
}

/** `date` prefixes FHIR ANDs together; an empty range adds no parameter. */
function dateRange(from: string | undefined, to: string | undefined): Record<string, unknown> {
  const bounds = [from === undefined ? undefined : `ge${from}`, to === undefined ? undefined : `le${to}`].filter(
    (bound): bound is string => bound !== undefined,
  );
  return bounds.length === 0 ? {} : { date: bounds };
}

/** `status=booked,noshow` is one FHIR token parameter whose comma ORs the values; an empty list adds none. */
function statusFilter(statuses: readonly string[] | undefined): Record<string, unknown> {
  return statuses === undefined || statuses.length === 0 ? {} : { status: statuses.join(',') };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Last instant an inclusive upper bound covers: a date-only `to` spans its whole day, as in FHIR `le`. */
function upperInstantOf(to: string): number {
  return Date.parse(to) + (DATE_ONLY.test(to) ? DAY_MS - 1 : 0);
}

function assertOrderedRange(from: string | undefined, to: string | undefined): void {
  if (from !== undefined && to !== undefined && Date.parse(from) > upperInstantOf(to)) {
    throw new BadRequestException({ errorCode: 'VALIDATION_ERROR', message: 'from must not be after to' });
  }
}

/**
 * Appointment read side (API §6.2, §6.3, §6.5). Every query is scoped by the
 * caller's compartment taken from the token (ADR-013), resolved before HAPI is
 * called, so an incomplete token fails closed without a FHIR round trip.
 */
@Injectable()
export class AppointmentQueriesService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  /** 6.2: the patient's own appointments; a `patient` query parameter is never consulted. */
  async listForPatient(claims: JwtClaims, query: PatientListQuery): Promise<AppointmentPage> {
    const patientRef = requirePatientReference(claims);
    const result = await this.fhir.search('Appointment', {
      patient: patientRef,
      ...(query.upcoming ? dateRange(new Date().toISOString(), undefined) : {}),
      ...statusFilter(query.status),
      ...searchParams(query),
    });
    return this.toPage(result, query);
  }

  /** 6.3: one appointment for its patient, its participant doctor or an admin. */
  async findById(claims: JwtClaims, appointmentId: string): Promise<AppointmentViewDto> {
    const viewer = resolveViewer(claims);
    const result = await this.fhir.search('Appointment', { _id: appointmentId, ...APPOINTMENT_INCLUDES });
    const appointment = appointmentsOf(result).find((resource) => resource.id === appointmentId);
    if (appointment === undefined) {
      throw new NotFoundException({ errorCode: 'NOT_FOUND', message: `NOT_FOUND: Appointment ${appointmentId} does not exist` });
    }
    assertViewerCanSee(viewer, appointment);
    return toAppointmentView(appointment, indexIncluded(result));
  }

  /** 6.5: appointments where the doctor's PractitionerRole (`fhirUser`) is a participant. */
  async listForDoctor(claims: JwtClaims, query: DoctorListQuery): Promise<AppointmentPage> {
    const roleRef = requireDoctorRoleRef(claims);
    assertOrderedRange(query.from, query.to);
    const result = await this.fhir.search('Appointment', {
      actor: roleRef,
      ...dateRange(query.from, query.to),
      ...searchParams(query),
    });
    return this.toPage(result, query);
  }

  private toPage(result: FhirSearchResult, query: PageQuery): AppointmentPage {
    const included = indexIncluded(result);
    const items = appointmentsOf(result).map((appointment) => toAppointmentView(appointment, included));
    // `_total=accurate` asks HAPI for the count; without it, the count is known up to this page.
    const totalItems = result.total ?? (query.page - 1) * query.pageSize + items.length;
    return buildPaginatedResponse(items, {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    });
  }
}
