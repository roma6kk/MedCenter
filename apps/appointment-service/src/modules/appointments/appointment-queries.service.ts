import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { clinicDayEndMs, clinicDayStartMs, type JwtClaims } from '@medcenter/common';
import { buildPaginatedResponse, type PaginatedResponseDto } from '@medcenter/contracts';
import { FHIR_CLIENT, type FhirClient, type FhirSearchResult } from '@medcenter/fhir';
import type { ContentLanguage } from '@medcenter/fhir-mappers';

import { APPOINTMENT_INCLUDES, appointmentsOf, indexIncluded, toAppointmentView } from './appointment-view.mapper';
import { assertViewerCanSee, requireDoctorRoleRef, resolveViewer } from './compartment';
import type { AppointmentViewDto } from './dto/appointment-view.dto';
import { requirePatientReference } from './fhir-reference';

export interface PageQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sortOrder: 'asc' | 'desc';
}

interface PatientListQuery extends PageQuery {
  readonly upcoming: boolean;
  readonly status?: readonly string[];
}

interface DoctorListQuery extends PageQuery {
  readonly from?: string;
  readonly to?: string;
  readonly status?: readonly string[];
  readonly patient?: string;
}

interface AdminListQuery extends PageQuery {
  readonly from?: string;
  readonly to?: string;
  readonly status?: readonly string[];
  readonly practitionerRoleId?: string;
}

export type AppointmentPage = PaginatedResponseDto<AppointmentViewDto>;

function searchParams(query: PageQuery): Record<string, unknown> {
  return {
    _sort: query.sortOrder === 'desc' ? '-date' : 'date',
    _count: query.pageSize,
    _offset: (query.page - 1) * query.pageSize,
    _total: 'accurate',
    ...APPOINTMENT_INCLUDES,
  };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

interface RangeBound {
  readonly search: string;
  readonly epochMs: number;
}

/** A date-only bound is a clinic day (Europe/Minsk): HAPI reads a bare `date` in UTC, three hours off. */
function resolveBound(bound: string, clinicDayInstant: (date: string) => number): RangeBound {
  if (!DATE_ONLY.test(bound)) {
    return { search: bound, epochMs: Date.parse(bound) };
  }
  const epochMs = clinicDayInstant(bound);
  return { search: new Date(epochMs).toISOString(), epochMs };
}

function lowerBound(from: string): RangeBound {
  return resolveBound(from, clinicDayStartMs);
}

function upperBound(to: string): RangeBound {
  return resolveBound(to, clinicDayEndMs);
}

function dateRange(from: string | undefined, to: string | undefined): Record<string, unknown> {
  const bounds = [
    from === undefined ? undefined : `ge${lowerBound(from).search}`,
    to === undefined ? undefined : `le${upperBound(to).search}`,
  ].filter((bound): bound is string => bound !== undefined);
  return bounds.length === 0 ? {} : { date: bounds };
}

function statusFilter(statuses: readonly string[] | undefined): Record<string, unknown> {
  return statuses === undefined || statuses.length === 0 ? {} : { status: statuses.join(',') };
}

function assertOrderedRange(from: string | undefined, to: string | undefined): void {
  if (from !== undefined && to !== undefined && lowerBound(from).epochMs > upperBound(to).epochMs) {
    throw new BadRequestException({ errorCode: 'VALIDATION_ERROR', message: 'from must not be after to' });
  }
}

@Injectable()
export class AppointmentQueriesService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  async listForPatient(claims: JwtClaims, query: PatientListQuery, lang?: ContentLanguage): Promise<AppointmentPage> {
    const patientRef = requirePatientReference(claims);
    const result = await this.fhir.search('Appointment', {
      patient: patientRef,
      ...(query.upcoming ? dateRange(new Date().toISOString(), undefined) : {}),
      ...statusFilter(query.status),
      ...searchParams(query),
    });
    return this.toPage(result, query, lang);
  }

  async findById(claims: JwtClaims, appointmentId: string, lang?: ContentLanguage): Promise<AppointmentViewDto> {
    const viewer = resolveViewer(claims);
    const result = await this.fhir.search('Appointment', { _id: appointmentId, ...APPOINTMENT_INCLUDES });
    const appointment = appointmentsOf(result).find((resource) => resource.id === appointmentId);
    if (appointment === undefined) {
      throw new NotFoundException({ errorCode: 'NOT_FOUND', message: `NOT_FOUND: Appointment ${appointmentId} does not exist` });
    }
    assertViewerCanSee(viewer, appointment);
    return toAppointmentView(appointment, indexIncluded(result), lang);
  }

  async listForDoctor(claims: JwtClaims, query: DoctorListQuery, lang?: ContentLanguage): Promise<AppointmentPage> {
    const roleRef = requireDoctorRoleRef(claims);
    assertOrderedRange(query.from, query.to);
    const result = await this.fhir.search('Appointment', {
      actor: roleRef,
      // A different search parameter than `actor`: FHIR ANDs them, so the compartment from the token still holds.
      ...(query.patient === undefined ? {} : { patient: `Patient/${query.patient}` }),
      ...statusFilter(query.status),
      ...dateRange(query.from, query.to),
      ...searchParams(query),
    });
    return this.toPage(result, query, lang);
  }

  async listForAdmin(query: AdminListQuery, lang?: ContentLanguage): Promise<AppointmentPage> {
    assertOrderedRange(query.from, query.to);
    const result = await this.fhir.search('Appointment', {
      ...(query.practitionerRoleId === undefined ? {} : { actor: `PractitionerRole/${query.practitionerRoleId}` }),
      ...statusFilter(query.status),
      ...dateRange(query.from, query.to),
      ...searchParams(query),
    });
    return this.toPage(result, query, lang);
  }

  private toPage(result: FhirSearchResult, query: PageQuery, lang?: ContentLanguage): AppointmentPage {
    const included = indexIncluded(result);
    const items = appointmentsOf(result).map((appointment) => toAppointmentView(appointment, included, lang));
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
