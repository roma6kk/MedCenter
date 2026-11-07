import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { PaginatedResponseDto } from '@medcenter/contracts';
import { DEFAULT_CONTENT_LANGUAGE, type ContentLanguage } from '@medcenter/fhir-mappers';
import { FHIR_CLIENT, FhirClientError, type FhirBundleEntry, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { toPage } from '../../common/page-envelope';
import { toDoctorDto } from './doctor.mapper';
import { matchesName } from './doctor-name-match';
import {
  distinctPractitionerIds,
  hasServiceFilter,
  ID_LOOKUP_CHUNK,
  needsRoleSearch,
  pageWindow,
  PRACTITIONER_SCAN_CHUNK,
  PRACTITIONER_SCAN_LIMIT,
  practitionerQuery,
  practitionerRoleQuery,
  practitionerRolesQuery,
  practitionerScanQuery,
  practitionersByIdQuery,
  roleIdsByPractitioner,
  roleIdsOfSchedules,
  serviceScheduleQuery,
  searchTerm,
  type DoctorFilters,
} from './doctor-search';
import type { DoctorResponseDto } from './dto/doctor-response.dto';

export type DoctorPage = PaginatedResponseDto<DoctorResponseDto>;

@Injectable()
export class DoctorsService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient) {}

  async list(filters: DoctorFilters, page = 1, pageSize = 20, lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): Promise<DoctorPage> {
    const term = searchTerm(filters);
    if (!needsRoleSearch(filters) && term === undefined) {
      const result = await this.fhirClient.search('Practitioner', practitionerQuery(pageWindow(page, pageSize)));
      const practitioners = (result.entry ?? []).map((entry) => entry.resource);
      return toPage(await this.withRoles(practitioners, lang), page, pageSize, result.total);
    }
    const candidates = needsRoleSearch(filters) ? await this.practitionersOfRoles(filters) : await this.allPractitioners();
    const doctors = term === undefined ? candidates : candidates.filter((practitioner) => matchesName(practitioner, term));
    const offset = (page - 1) * pageSize;
    return toPage(await this.withRoles(doctors.slice(offset, offset + pageSize), lang), page, pageSize, doctors.length);
  }

  private async practitionersOfRoles(filters: DoctorFilters): Promise<FhirResource[]> {
    const entries: FhirBundleEntry[] = [];
    if (hasServiceFilter(filters)) {
      const schedules = await this.fhirClient.search('Schedule', serviceScheduleQuery(filters.serviceId ?? ''));
      const roleIds = roleIdsOfSchedules(schedules.entry ?? []);
      for (let start = 0; start < roleIds.length; start += ID_LOOKUP_CHUNK) {
        const roles = await this.fhirClient.search('PractitionerRole', practitionerRoleQuery(filters, roleIds.slice(start, start + ID_LOOKUP_CHUNK)));
        entries.push(...(roles.entry ?? []));
      }
    } else {
      entries.push(...((await this.fhirClient.search('PractitionerRole', practitionerRoleQuery(filters))).entry ?? []));
    }
    return this.practitionersById(distinctPractitionerIds(entries));
  }

  private async allPractitioners(): Promise<FhirResource[]> {
    const practitioners: FhirResource[] = [];
    for (let scanned = 0; scanned < PRACTITIONER_SCAN_LIMIT; scanned += PRACTITIONER_SCAN_CHUNK) {
      const result = await this.fhirClient.search('Practitioner', practitionerScanQuery(scanned));
      const chunk = (result.entry ?? []).map((entry) => entry.resource);
      practitioners.push(...chunk.filter((resource) => resource.resourceType === 'Practitioner'));
      if (chunk.length < PRACTITIONER_SCAN_CHUNK) {
        break;
      }
    }
    return practitioners;
  }

  // Ids HAPI does not return are dropped before the page is cut, which keeps total and pages exact.
  private async practitionersById(ids: readonly string[]): Promise<FhirResource[]> {
    const byId = new Map<string | undefined, FhirResource>();
    for (let start = 0; start < ids.length; start += ID_LOOKUP_CHUNK) {
      const found = await this.fhirClient.search('Practitioner', practitionersByIdQuery(ids.slice(start, start + ID_LOOKUP_CHUNK)));
      for (const { resource } of found.entry ?? []) {
        if (resource.resourceType === 'Practitioner') {
          byId.set(resource.id, resource);
        }
      }
    }
    return ids.flatMap((id) => {
      const practitioner = byId.get(id);
      return practitioner === undefined ? [] : [practitioner];
    });
  }

  // 404 also for a deactivated doctor: the public cannot tell a hidden doctor from a missing one.
  async findById(id: string, lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): Promise<DoctorResponseDto> {
    const practitioner = await this.fhirClient.read('Practitioner', id);
    if (practitioner['active'] === false) {
      throw new FhirClientError('GET', `Practitioner/${id}`, HttpStatus.NOT_FOUND);
    }
    const [doctor] = await this.withRoles([practitioner], lang);
    return doctor ?? toDoctorDto(practitioner, [], lang);
  }

  private async withRoles(practitioners: readonly FhirResource[], lang: ContentLanguage): Promise<DoctorResponseDto[]> {
    const ids = practitioners.flatMap((practitioner) => (practitioner.id === undefined ? [] : [practitioner.id]));
    if (ids.length === 0) {
      return practitioners.map((practitioner) => toDoctorDto(practitioner, [], lang));
    }
    const roles = await this.fhirClient.search('PractitionerRole', practitionerRolesQuery(ids));
    const roleIds = roleIdsByPractitioner(roles.entry ?? []);
    return practitioners.map((practitioner) => toDoctorDto(practitioner, roleIds.get(practitioner.id ?? '') ?? [], lang));
  }
}
