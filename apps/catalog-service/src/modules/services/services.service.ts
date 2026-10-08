import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { FHIR_BY, MEDCENTER_EXT } from '@medcenter/terminology';

import { CACHE_KEYS, CACHE_TTLS, RedisCacheService } from '../cache/redis-cache.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import type { ServiceResponseDto } from './dto/service-response.dto';

/** HAPI answers `$lookup` of an unknown code (or system) with one of these. */
const LOOKUP_NOT_FOUND_STATUSES: ReadonlySet<number> = new Set([400, 404, 422]);

/**
 * Services catalog (API §5.1, FR-003). `typeCode` must exist in the seeded
 * НСИ ЦИСЗ ValueSet (`FHIR_BY.SERVICE_CODE_SYSTEM`) or the request is rejected
 * with `422 TERMINOLOGY_NOT_FOUND` (ADR-002).
 */
@Injectable()
export class ServicesService {
  constructor(
    @Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient,
    private readonly cache: RedisCacheService,
  ) {}

  async list(page = 1, pageSize = 20, search?: string): Promise<ServiceResponseDto[]> {
    return this.cache.getOrLoad(
      `${CACHE_KEYS.SERVICES}:${search ?? ''}:${page}:${pageSize}`,
      CACHE_TTLS.SERVICES_SECONDS,
      async () => {
        const result = await this.fhirClient.search('HealthcareService', {
          ...(search === undefined ? {} : { name: search }),
          _count: pageSize,
          _offset: (page - 1) * pageSize,
        });
        return (result.entry ?? []).map((entry) => this.toResponseDto(entry.resource));
      },
    );
  }

  async findById(id: string): Promise<ServiceResponseDto> {
    const resource = await this.fhirClient.read('HealthcareService', id);
    return this.toResponseDto(resource);
  }

  async create(dto: CreateServiceDto): Promise<ServiceResponseDto> {
    await this.assertTerminology(dto.typeSystem, dto.typeCode);
    const created = await this.fhirClient.create(
      'HealthcareService',
      this.toHealthcareService(dto),
    );
    await this.invalidate();
    return this.toResponseDto(created);
  }

  async update(id: string, dto: UpdateServiceDto): Promise<ServiceResponseDto> {
    // A system without a code would rebuild the coding with no code at all
    // and skip the terminology check — the pair is only valid together.
    if (dto.typeSystem !== undefined && dto.typeCode === undefined) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'typeSystem: must be supplied together with typeCode',
      });
    }
    if (dto.typeCode !== undefined) {
      await this.assertTerminology(dto.typeSystem ?? FHIR_BY.SERVICE_CODE_SYSTEM, dto.typeCode);
    }
    const existing = await this.fhirClient.read('HealthcareService', id);
    const merged = this.mergeDefined(existing, this.toHealthcareService(dto));
    // A partial type update (e.g. only typeCode) must replace the whole type
    // coding — mixing a new code with the old system would be incoherent.
    if (dto.typeCode !== undefined) {
      const typeCoding = this.toHealthcareService({
        typeSystem: dto.typeSystem ?? FHIR_BY.SERVICE_CODE_SYSTEM,
        typeCode: dto.typeCode,
      })['type'];
      (merged as Record<string, unknown>)['type'] = typeCoding;
    }
    const updated = await this.fhirClient.update('HealthcareService', id, merged);
    await this.invalidate();
    return this.toResponseDto(updated);
  }

  /** Spread-merge that skips undefined values so a partial DTO never blanks
   *  existing fields (the previous `{ ...existing, ...patch }` did). */
  private mergeDefined(base: FhirResource, patch: FhirResource): FhirResource {
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }
    return merged as FhirResource;
  }

  async remove(id: string): Promise<void> {
    const schedules = await this.fhirClient.search('Schedule', {
      service: `HealthcareService/${id}`,
      active: 'true',
    });
    if ((schedules.entry ?? []).length > 0) {
      throw new ConflictException({
        errorCode: 'SERVICE_IN_USE',
        message: `SERVICE_IN_USE: service ${id} is referenced by an active schedule`,
      });
    }
    await this.fhirClient.delete('HealthcareService', id);
    await this.invalidate();
  }

  private async invalidate(): Promise<void> {
    // The service list is cached under `services:<search>:<page>:<pageSize>`;
    // the trailing colon makes RedisCacheService expand the prefix and clear
    // every cached page regardless of the search/page combination.
    await this.cache.invalidate([`${CACHE_KEYS.SERVICES}:`]);
  }

  /**
   * BR-004/ADR-002: the code must exist in the seeded НСИ CodeSystem. The check
   * is a `CodeSystem/$lookup` against HAPI (`code` is not a CodeSystem search
   * parameter). HAPI answers a known concept with `200 Parameters` and an
   * unknown one with a 4xx OperationOutcome — that 4xx becomes the 422 here;
   * any other failure (5xx, timeout) propagates as the client's 502/504.
   */
  private async assertTerminology(typeSystem: string, typeCode: string): Promise<void> {
    if (typeSystem !== FHIR_BY.SERVICE_CODE_SYSTEM) {
      throw this.terminologyNotFound(`unsupported type system ${typeSystem}`);
    }
    let lookup: FhirResource;
    try {
      lookup = await this.fhirClient.operation('CodeSystem', '$lookup', {
        system: typeSystem,
        code: typeCode,
      });
    } catch (error) {
      if (
        error instanceof FhirClientError &&
        error.upstreamStatus !== undefined &&
        LOOKUP_NOT_FOUND_STATUSES.has(error.upstreamStatus)
      ) {
        throw this.terminologyNotFound(`unknown НСИ service code ${typeCode}`);
      }
      throw error;
    }
    if (lookup.resourceType !== 'Parameters') {
      throw this.terminologyNotFound(`unknown НСИ service code ${typeCode}`);
    }
  }

  private terminologyNotFound(reason: string): UnprocessableEntityException {
    return new UnprocessableEntityException({
      errorCode: 'TERMINOLOGY_NOT_FOUND',
      message: `TERMINOLOGY_NOT_FOUND: ${reason}`,
    });
  }

  private toHealthcareService(dto: Partial<CreateServiceDto>): FhirResource {
    const resource: Record<string, unknown> = {
      resourceType: 'HealthcareService',
      name: dto.name,
      comment: dto.description,
      ...(dto.defaultDurationMin === undefined
        ? {}
        : {
            extension: [
              { url: MEDCENTER_EXT.SERVICE_DEFAULT_DURATION, valueInteger: dto.defaultDurationMin },
            ],
          }),
    };
    // `type` is emitted only when the DTO carries a code, otherwise a partial
    // PATCH (e.g. name-only) would merge a code-less coding over the stored one.
    if (dto.typeCode !== undefined) {
      resource['type'] = [
        {
          coding: [
            {
              system: dto.typeSystem,
              code: dto.typeCode,
            },
          ],
        },
      ];
    }
    return resource as FhirResource;
  }

  private toResponseDto(resource: FhirResource): ServiceResponseDto {
    const coding = this.readCoding(resource);
    return {
      id: resource.id ?? '',
      name: typeof resource['name'] === 'string' ? (resource['name'] as string) : '',
      typeSystem: coding.system ?? '',
      typeCode: coding.code ?? '',
      typeDisplay: coding.display ?? '',
      defaultDurationMin: this.readDuration(resource),
      description:
        typeof resource['comment'] === 'string' ? (resource['comment'] as string) : undefined,
      isActive: resource['active'] !== false,
    };
  }

  private readCoding(resource: FhirResource): { system?: string; code?: string; display?: string } {
    const type = resource['type'];
    if (!Array.isArray(type) || type.length === 0) {
      return {};
    }
    const [first] = type as Array<Record<string, unknown>>;
    const coding = first?.['coding'];
    if (!Array.isArray(coding) || coding.length === 0) {
      return {};
    }
    return coding[0] as { system?: string; code?: string; display?: string };
  }

  private readDuration(resource: FhirResource): number {
    const extensions = resource['extension'];
    if (!Array.isArray(extensions)) {
      return 0;
    }
    const duration = (extensions as Array<Record<string, unknown>>).find(
      (ext) => ext['url'] === MEDCENTER_EXT.SERVICE_DEFAULT_DURATION,
    );
    return typeof duration?.['valueInteger'] === 'number' ? (duration['valueInteger'] as number) : 0;
  }
}
