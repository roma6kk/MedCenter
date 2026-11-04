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

/** One page of the doctor catalog in the API §0 envelope. */
export type DoctorPage = PaginatedResponseDto<DoctorResponseDto>;

/**
 * Doctor catalog read side (API §4.1–4.2, FR-002/016). Public, no admin writes here. `lang` (from `Accept-Language`)
 * localizes name and specialty text; nothing is cached here, so the language needs no key.
 */
@Injectable()
export class DoctorsService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient) {}

  /**
   * The service and specialty filters live on `PractitionerRole` (FHIR has no
   * `Practitioner` search parameter for either), so they are asked of the roles
   * (ids only). The distinct doctors behind the matching roles are what is paged
   * and counted: `totalItems` is the number of doctors, a doctor with two matching
   * roles counts once, and a deactivated doctor is not one of them. The name is matched
   * here, in Russian and in English ({@link matchesName}), over the doctors the other filters
   * left. Without any filter the list is a plain `Practitioner` search paged by HAPI. Either way
   * every listed doctor carries all of its active roles (one more `PractitionerRole` search for the
   * page), not only the ones the filter matched.
   */
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

  /**
   * The doctors behind the roles that match the service and specialty filters, in role order. The roles of a service are
   * the roles with an active schedule of it; none of them means no doctor, whatever the specialty.
   */
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

  /**
   * Every doctor that is not deactivated, in HAPI order, read in chunks until HAPI runs out; bounded by
   * {@link PRACTITIONER_SCAN_LIMIT}, which a clinic's staff does not come near.
   */
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

  /**
   * The doctors with these ids, in the given order. An id HAPI does not return (deleted, or deactivated and so hidden)
   * is dropped before the page is cut, which keeps the total and the pages of a filtered list exact.
   */
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

  /** `404` also for a deactivated doctor, answered as HAPI's own 404 for an unknown id: the public cannot tell a hidden doctor from a missing one. */
  async findById(id: string, lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): Promise<DoctorResponseDto> {
    const practitioner = await this.fhirClient.read('Practitioner', id);
    if (practitioner['active'] === false) {
      throw new FhirClientError('GET', `Practitioner/${id}`, HttpStatus.NOT_FOUND);
    }
    const [doctor] = await this.withRoles([practitioner], lang);
    return doctor ?? toDoctorDto(practitioner, [], lang);
  }

  /** The doctors as DTOs with their `practitionerRoleIds`; no `PractitionerRole` search when there is no doctor. */
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
