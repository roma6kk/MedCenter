import { Inject, Injectable } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { toDoctorResponseDto } from '@medcenter/fhir-mappers';

import type { DoctorResponseDto } from './dto/doctor-response.dto';

/** Doctor catalog read side (API §4.1–4.2, FR-002/016). Public, no admin writes here. */
@Injectable()
export class DoctorsService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient) {}

  async list(
    params: { serviceId?: string; specialty?: string; search?: string },
    page = 1,
    pageSize = 20,
  ): Promise<DoctorResponseDto[]> {
    // A `serviceId` filter resolves through PractitionerRole (FHIR has no
    // direct Practitioner↔HealthcareService search): first collect the
    // practitioner references from the roles serving that service, then
    // search Practitioner restricted to those ids.
    if (params.serviceId !== undefined) {
      // Explicit re-binding: the serviceId was just checked defined.
      const { serviceId } = params;
      return this.listByService({ ...params, serviceId }, page, pageSize);
    }

    const result = await this.fhirClient.search('Practitioner', {
      ...(params.specialty === undefined ? {} : { 'qualification-code': params.specialty }),
      ...(params.search === undefined ? {} : { name: params.search }),
      _count: pageSize,
      _offset: (page - 1) * pageSize,
    });
    return (result.entry ?? []).map((entry) => toDoctorResponseDto(entry.resource));
  }

  private async listByService(
    params: { serviceId: string; specialty?: string; search?: string },
    page: number,
    pageSize: number,
  ): Promise<DoctorResponseDto[]> {
    const roles = await this.fhirClient.search('PractitionerRole', {
      service: `HealthcareService/${params.serviceId}`,
      _count: 500,
    });
    const practitionerIds = (roles.entry ?? [])
      .map((entry) => this.readPractitionerId(entry.resource))
      .filter((id): id is string => id !== undefined);
    if (practitionerIds.length === 0) {
      return [];
    }

    const result = await this.fhirClient.search('Practitioner', {
      _id: practitionerIds.slice(0, 200).join(','),
      ...(params.specialty === undefined ? {} : { 'qualification-code': params.specialty }),
      ...(params.search === undefined ? {} : { name: params.search }),
      _count: pageSize,
      _offset: (page - 1) * pageSize,
    });
    return (result.entry ?? []).map((entry) => toDoctorResponseDto(entry.resource));
  }

  private readPractitionerId(role: FhirResource): string | undefined {
    const actors = role['practitioner'];
    if (typeof actors !== 'object' || actors === null) {
      return undefined;
    }
    const { reference } = actors as { reference?: unknown };
    if (typeof reference !== 'string') {
      return undefined;
    }
    const id = reference.split('/').pop();
    return id === '' ? undefined : id;
  }

  async findById(id: string): Promise<DoctorResponseDto> {
    const practitioner = await this.fhirClient.read('Practitioner', id);
    return toDoctorResponseDto(practitioner);
  }
}
