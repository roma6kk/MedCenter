import { Inject, Injectable } from '@nestjs/common';
import type { PaginatedResponseDto } from '@medcenter/contracts';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { toPage } from '../../common/page-envelope';
import { toDoctorDto } from './doctor.mapper';
import {
  needsRoleSearch,
  pageWindow,
  practitionerQuery,
  practitionerRoleQuery,
  practitionerRolesQuery,
  practitionersOfRoles,
  roleIdsByPractitioner,
  type DoctorFilters,
} from './doctor-search';
import type { DoctorResponseDto } from './dto/doctor-response.dto';

/** One page of the doctor catalog in the API §0 envelope. */
export type DoctorPage = PaginatedResponseDto<DoctorResponseDto>;

/** Doctor catalog read side (API §4.1–4.2, FR-002/016). Public, no admin writes here. */
@Injectable()
export class DoctorsService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient) {}

  /**
   * The service and specialty filters live on `PractitionerRole` (FHIR has no
   * `Practitioner` search parameter for either), so they are asked of the role
   * with the practitioner `_include`d; paging then runs over the roles and the
   * total is the number of matching roles. Without them the list is a plain
   * `Practitioner` search. Either way every listed doctor carries all of its
   * active roles (one more `PractitionerRole` search for the page), not only
   * the ones the filter matched.
   */
  async list(filters: DoctorFilters, page = 1, pageSize = 20): Promise<DoctorPage> {
    const window = pageWindow(page, pageSize);
    if (needsRoleSearch(filters)) {
      const roles = await this.fhirClient.search('PractitionerRole', practitionerRoleQuery(filters, window));
      const practitioners = practitionersOfRoles(roles.entry ?? []);
      return toPage(await this.withRoles(practitioners), page, pageSize, roles.total);
    }
    const result = await this.fhirClient.search('Practitioner', practitionerQuery(filters, window));
    const practitioners = (result.entry ?? []).map((entry) => entry.resource);
    return toPage(await this.withRoles(practitioners), page, pageSize, result.total);
  }

  async findById(id: string): Promise<DoctorResponseDto> {
    const practitioner = await this.fhirClient.read('Practitioner', id);
    const [doctor] = await this.withRoles([practitioner]);
    return doctor ?? toDoctorDto(practitioner);
  }

  /** The doctors as DTOs with their `practitionerRoleIds`; no `PractitionerRole` search when there is no doctor. */
  private async withRoles(practitioners: readonly FhirResource[]): Promise<DoctorResponseDto[]> {
    const ids = practitioners.flatMap((practitioner) => (practitioner.id === undefined ? [] : [practitioner.id]));
    if (ids.length === 0) {
      return practitioners.map((practitioner) => toDoctorDto(practitioner));
    }
    const roles = await this.fhirClient.search('PractitionerRole', practitionerRolesQuery(ids));
    const roleIds = roleIdsByPractitioner(roles.entry ?? []);
    return practitioners.map((practitioner) => toDoctorDto(practitioner, roleIds.get(practitioner.id ?? '') ?? []));
  }
}
