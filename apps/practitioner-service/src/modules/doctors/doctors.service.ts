import { Inject, Injectable } from '@nestjs/common';
import type { PaginatedResponseDto } from '@medcenter/contracts';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

import { toPage } from '../../common/page-envelope';
import { toDoctorDto } from './doctor.mapper';
import {
  needsRoleSearch,
  pageWindow,
  practitionerQuery,
  practitionerRoleQuery,
  practitionersOfRoles,
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
   * `Practitioner` search.
   */
  async list(filters: DoctorFilters, page = 1, pageSize = 20): Promise<DoctorPage> {
    const window = pageWindow(page, pageSize);
    if (needsRoleSearch(filters)) {
      const roles = await this.fhirClient.search('PractitionerRole', practitionerRoleQuery(filters, window));
      const doctors = practitionersOfRoles(roles.entry ?? []).map(toDoctorDto);
      return toPage(doctors, page, pageSize, roles.total);
    }
    const result = await this.fhirClient.search('Practitioner', practitionerQuery(filters, window));
    const doctors = (result.entry ?? []).map((entry) => toDoctorDto(entry.resource));
    return toPage(doctors, page, pageSize, result.total);
  }

  async findById(id: string): Promise<DoctorResponseDto> {
    const practitioner = await this.fhirClient.read('Practitioner', id);
    return toDoctorDto(practitioner);
  }
}
