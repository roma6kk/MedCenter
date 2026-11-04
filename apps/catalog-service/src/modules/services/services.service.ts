import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { buildPaginatedResponse, type PaginatedResponseDto } from '@medcenter/contracts';
import { DEFAULT_CONTENT_LANGUAGE, translated, translationExtension, type ContentLanguage } from '@medcenter/fhir-mappers';
import {
  createAudited,
  deleteAudited,
  FHIR_CLIENT,
  FhirClientError,
  updateAudited,
  type AuditContext,
  type FhirClient,
  type FhirResource,
  type WriteActor,
} from '@medcenter/fhir';
import { FHIR_BY, MEDCENTER_EXT } from '@medcenter/terminology';

import { CACHE_KEYS, CACHE_TTLS, RedisCacheService } from '../cache/redis-cache.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import type { ServiceResponseDto } from './dto/service-response.dto';

/** One page of the services catalog in the API §0 envelope. */
export type ServicePage = PaginatedResponseDto<ServiceResponseDto>;

/** `AuditEvent.source` of the writes of this service. */
const AUDIT_SOURCE = 'catalog-service';

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

  /**
   * Public listing (API §5.1.1). Only the plain, search-free listing is cached,
   * one entry per validated (page, pageSize) — a key per free-text term would
   * let an anonymous caller fill the shared Redis with arbitrary strings, so a
   * search always goes to HAPI (a cheap `name` match, over the stored Russian name). The cached page holds the
   * localized names, so there is one entry per language as well.
   */
  async list(page = 1, pageSize = 20, search?: string, lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): Promise<ServicePage> {
    const term = search?.trim() ?? '';
    const load = (): Promise<ServicePage> => this.loadPage(page, pageSize, term, lang, false);
    if (term !== '') {
      return load();
    }
    return this.cache.getOrLoad(CACHE_KEYS.SERVICES_PAGE(page, pageSize, lang), CACHE_TTLS.SERVICES_SECONDS, load);
  }

  /**
   * Administrator's listing (API §5.1.6): the same page as the public one, deactivated services included. Not cached:
   * the administrator must see a switch at once, and the public pages are cleared by the same writes anyway.
   */
  async listAll(page = 1, pageSize = 20, search?: string, lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): Promise<ServicePage> {
    return this.loadPage(page, pageSize, search?.trim() ?? '', lang, true);
  }

  /**
   * `_total=accurate` asks HAPI for the count; without one the total is known
   * only up to this page, which is the honest lower bound. The public page hides a deactivated service
   * (`:not` also matches a service without `active`, the element is optional in FHIR), so the total counts what is shown.
   */
  private async loadPage(page: number, pageSize: number, term: string, lang: ContentLanguage, includeInactive: boolean): Promise<ServicePage> {
    const result = await this.fhirClient.search('HealthcareService', {
      ...(term === '' ? {} : { name: term }),
      ...(includeInactive ? {} : { 'active:not': 'false' }),
      _count: pageSize,
      _offset: (page - 1) * pageSize,
      _total: 'accurate',
    });
    const items = (result.entry ?? []).map((entry) => this.toResponseDto(entry.resource, lang));
    const totalItems = result.total ?? (page - 1) * pageSize + items.length;
    return buildPaginatedResponse(items, {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    });
  }

  /** `404` also for a deactivated service, as HAPI's own 404 for an unknown id: the public cannot tell a hidden service from a missing one. */
  async findById(id: string, lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): Promise<ServiceResponseDto> {
    const resource = await this.fhirClient.read('HealthcareService', id);
    if (resource['active'] === false) {
      throw new FhirClientError('GET', `HealthcareService/${id}`, HttpStatus.NOT_FOUND);
    }
    return this.toResponseDto(resource, lang);
  }

  /** Admin writes carry their `AuditEvent` in the same transaction (FR-021, ADR-014). */
  private auditOf(actor: WriteActor): AuditContext {
    return { actor, source: AUDIT_SOURCE };
  }

  async create(dto: CreateServiceDto, actor: WriteActor): Promise<ServiceResponseDto> {
    await this.assertTerminology(dto.typeSystem, dto.typeCode);
    const created = await createAudited(this.fhirClient, this.toHealthcareService({ ...dto, isActive: dto.isActive ?? true }), this.auditOf(actor));
    await this.invalidate();
    return this.toResponseDto(created);
  }

  async update(id: string, dto: UpdateServiceDto, actor: WriteActor): Promise<ServiceResponseDto> {
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
    this.mergeTranslations(merged, dto);
    // A partial type update (e.g. only typeCode) must replace the whole type
    // coding — mixing a new code with the old system would be incoherent.
    if (dto.typeCode !== undefined) {
      const typeCoding = this.toHealthcareService({
        typeSystem: dto.typeSystem ?? FHIR_BY.SERVICE_CODE_SYSTEM,
        typeCode: dto.typeCode,
      })['type'];
      (merged as Record<string, unknown>)['type'] = typeCoding;
    }
    const updated = await updateAudited(this.fhirClient, { ...merged, id }, this.auditOf(actor));
    await this.invalidate();
    return this.toResponseDto(updated);
  }

  /**
   * The English text rides on `_name` / `_comment`. `mergeDefined` already keeps the stored one when the PATCH leaves
   * the English field out; a blank string removes it (e.g. the Russian name changed and the old translation no longer fits).
   * A blank `description` clears the description: FHIR JSON forbids `"comment": ""`, so the element is removed, and its
   * English text with it unless the same PATCH brings a new one.
   */
  private mergeTranslations(merged: FhirResource, dto: UpdateServiceDto): void {
    const target = merged as Record<string, unknown>;
    if (dto.description !== undefined && dto.description.trim() === '') {
      delete target['comment'];
      if (dto.descriptionEn === undefined || dto.descriptionEn.trim() === '') {
        delete target['_comment'];
      }
    }
    if (dto.nameEn?.trim() === '') {
      delete target['_name'];
    }
    if (dto.descriptionEn?.trim() === '') {
      delete target['_comment'];
    }
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

  /**
   * API §5.1.5. The service is a `Schedule.actor` and `actor` is the R4 search
   * parameter over it — R4 `Schedule` has no `service` parameter (HAPI answers
   * 400). No `active` filter: HAPI keeps referential integrity on delete, so a
   * deactivated schedule pins the service too (same rule as `ROOM_IN_USE`). A doctor role that lists the service
   * (`PractitionerRole.service`) pins it as well, and so does any other resource HAPI refuses the delete for.
   *
   * `SERVICE_IN_USE` is catalogued in `ERROR_CODES` (libs/contracts), so
   * `ProblemDetailsFilter` promotes it to the response `errorCode`; the same
   * label stays at the start of `detail` for logs and older clients.
   */
  async remove(id: string, actor: WriteActor): Promise<void> {
    // An unknown id is a 404 from HAPI; the delete's AuditEvent needs a stored resource to point at.
    await this.fhirClient.read('HealthcareService', id);
    const schedules = await this.fhirClient.search('Schedule', {
      actor: `HealthcareService/${id}`,
      _count: 1,
    });
    if ((schedules.entry ?? []).length > 0) {
      throw this.serviceInUse(`service ${id} is referenced by a schedule`);
    }
    // A doctor role that lists the service (`PractitionerRole.healthcareService`, written by the demo seed) pins it as well.
    const roles = await this.fhirClient.search('PractitionerRole', { service: `HealthcareService/${id}`, _count: 1 });
    if ((roles.entry ?? []).length > 0) {
      throw this.serviceInUse(`service ${id} is referenced by a doctor role`);
    }
    try {
      await deleteAudited(this.fhirClient, 'HealthcareService', id, this.auditOf(actor));
    } catch (error) {
      // HAPI's referential integrity refuses the delete for any other resource that points at the service.
      if (error instanceof ConflictException) {
        throw this.serviceInUse(`service ${id} is referenced by other resources`);
      }
      throw error;
    }
    await this.invalidate();
  }

  private serviceInUse(reason: string): ConflictException {
    return new ConflictException({ errorCode: 'SERVICE_IN_USE', message: `SERVICE_IN_USE: ${reason}` });
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
      active: dto.isActive,
      comment: dto.description?.trim() === '' ? undefined : dto.description,
      ...this.translationElements(dto),
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

  /** `_name` / `_comment` with the English text of the DTO; nothing for an absent or blank one. */
  private translationElements(dto: Partial<CreateServiceDto>): Record<string, unknown> {
    const elements: Record<string, unknown> = {};
    if (dto.nameEn !== undefined && dto.nameEn.trim() !== '') {
      elements['_name'] = { extension: [translationExtension('en', dto.nameEn.trim())] };
    }
    if (dto.descriptionEn !== undefined && dto.descriptionEn.trim() !== '') {
      elements['_comment'] = { extension: [translationExtension('en', dto.descriptionEn.trim())] };
    }
    return elements;
  }

  /** The stored English text of a primitive (`_name`, `_comment`), whatever language the request asked for. */
  private englishOf(resource: FhirResource, field: 'name' | 'comment'): string | undefined {
    const original = resource[field];
    if (typeof original !== 'string') {
      return undefined;
    }
    const english = translated(original, resource[`_${field}`], 'en');
    return english === original ? undefined : english;
  }

  private toResponseDto(resource: FhirResource, lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): ServiceResponseDto {
    const coding = this.readCoding(resource);
    const name = typeof resource['name'] === 'string' ? (resource['name'] as string) : '';
    const description = typeof resource['comment'] === 'string' ? (resource['comment'] as string) : undefined;
    const nameEn = this.englishOf(resource, 'name');
    const descriptionEn = this.englishOf(resource, 'comment');
    return {
      id: resource.id ?? '',
      name: translated(name, resource['_name'], lang),
      typeSystem: coding.system ?? '',
      typeCode: coding.code ?? '',
      typeDisplay: coding.display ?? '',
      defaultDurationMin: this.readDuration(resource),
      description: description === undefined ? undefined : translated(description, resource['_comment'], lang),
      ...(nameEn === undefined ? {} : { nameEn }),
      ...(descriptionEn === undefined ? {} : { descriptionEn }),
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
