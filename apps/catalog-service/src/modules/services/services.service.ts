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
  type FhirClient,
  type FhirResource,
  type WriteActor,
} from '@medcenter/fhir';
import { FHIR_BY, MEDCENTER_EXT } from '@medcenter/terminology';

import { auditOf } from '../../common/audit';
import { CACHE_KEYS, CACHE_TTLS, RedisCacheService } from '../cache/redis-cache.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import type { ServiceResponseDto } from './dto/service-response.dto';

export type ServicePage = PaginatedResponseDto<ServiceResponseDto>;

const LOOKUP_NOT_FOUND_STATUSES: ReadonlySet<number> = new Set([400, 404, 422]);

@Injectable()
export class ServicesService {
  constructor(
    @Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient,
    private readonly cache: RedisCacheService,
  ) {}

  /** Only the search-free listing is cached: a key per free-text term would let an anonymous caller fill the shared Redis. */
  async list(page = 1, pageSize = 20, search?: string, lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): Promise<ServicePage> {
    const term = search?.trim() ?? '';
    const load = (): Promise<ServicePage> => this.loadPage(page, pageSize, term, lang, false);
    if (term !== '') {
      return load();
    }
    return this.cache.getOrLoad(CACHE_KEYS.SERVICES_PAGE(page, pageSize, lang), CACHE_TTLS.SERVICES_SECONDS, load, (page) => page.items.length > 0);
  }

  async listAll(page = 1, pageSize = 20, search?: string, lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): Promise<ServicePage> {
    return this.loadPage(page, pageSize, search?.trim() ?? '', lang, true);
  }

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

  /** 404 also for a deactivated service: the public cannot tell a hidden service from a missing one. */
  async findById(id: string, lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): Promise<ServiceResponseDto> {
    const resource = await this.fhirClient.read('HealthcareService', id);
    if (resource['active'] === false) {
      throw new FhirClientError('GET', `HealthcareService/${id}`, HttpStatus.NOT_FOUND);
    }
    return this.toResponseDto(resource, lang);
  }

  async create(dto: CreateServiceDto, actor: WriteActor): Promise<ServiceResponseDto> {
    const typeDisplay = await this.assertTerminology(dto.typeSystem, dto.typeCode);
    const created = await createAudited(
      this.fhirClient,
      this.toHealthcareService({ ...dto, isActive: dto.isActive ?? true }, typeDisplay),
      auditOf(actor),
    );
    await this.invalidate();
    return this.toResponseDto(created);
  }

  async update(id: string, dto: UpdateServiceDto, actor: WriteActor): Promise<ServiceResponseDto> {
    // A system without a code would skip the terminology check: the pair is only valid together.
    if (dto.typeSystem !== undefined && dto.typeCode === undefined) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'typeSystem: must be supplied together with typeCode',
      });
    }
    let typeDisplay: string | undefined;
    if (dto.typeCode !== undefined) {
      typeDisplay = await this.assertTerminology(dto.typeSystem ?? FHIR_BY.SERVICE_CODE_SYSTEM, dto.typeCode);
    }
    const existing = await this.fhirClient.read('HealthcareService', id);
    const merged = this.mergeDefined(existing, this.toHealthcareService(dto));
    this.mergeTranslations(merged, dto);
    // A partial type update replaces the whole coding: a new code with the old system would be incoherent.
    if (dto.typeCode !== undefined) {
      (merged as Record<string, unknown>)['type'] = this.toHealthcareService(
        { typeSystem: dto.typeSystem ?? FHIR_BY.SERVICE_CODE_SYSTEM, typeCode: dto.typeCode },
        typeDisplay,
      )['type'];
    }
    const updated = await updateAudited(this.fhirClient, { ...merged, id }, auditOf(actor));
    await this.invalidate();
    return this.toResponseDto(updated);
  }

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

  private mergeDefined(base: FhirResource, patch: FhirResource): FhirResource {
    return { ...base, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) } as FhirResource;
  }

  /** `actor` is the R4 search parameter over the service: R4 `Schedule` has no `service` parameter (HAPI answers 400). */
  async remove(id: string, actor: WriteActor): Promise<void> {
    await this.fhirClient.read('HealthcareService', id);
    const schedules = await this.fhirClient.search('Schedule', {
      actor: `HealthcareService/${id}`,
      _count: 1,
    });
    if ((schedules.entry ?? []).length > 0) {
      throw this.serviceInUse(`service ${id} is referenced by a schedule`);
    }
    const roles = await this.fhirClient.search('PractitionerRole', { service: `HealthcareService/${id}`, _count: 1 });
    if ((roles.entry ?? []).length > 0) {
      throw this.serviceInUse(`service ${id} is referenced by a doctor role`);
    }
    try {
      await deleteAudited(this.fhirClient, 'HealthcareService', id, auditOf(actor));
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
    // The trailing colon makes RedisCacheService clear every cached page of the prefix.
    await this.cache.invalidate([`${CACHE_KEYS.SERVICES}:`]);
  }

  /** `code` is not a CodeSystem search parameter, so the check is a `CodeSystem/$lookup` against HAPI. */
  private async assertTerminology(typeSystem: string, typeCode: string): Promise<string | undefined> {
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
    const parameters = Array.isArray(lookup['parameter']) ? (lookup['parameter'] as Array<{ name?: unknown; valueString?: unknown }>) : [];
    const display = parameters.find((parameter) => parameter.name === 'display')?.valueString;
    return typeof display === 'string' && display.trim() !== '' ? display : undefined;
  }

  private terminologyNotFound(reason: string): UnprocessableEntityException {
    return new UnprocessableEntityException({
      errorCode: 'TERMINOLOGY_NOT_FOUND',
      message: `TERMINOLOGY_NOT_FOUND: ${reason}`,
    });
  }

  private toHealthcareService(dto: Partial<CreateServiceDto>, typeDisplay?: string): FhirResource {
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
    if (dto.typeCode !== undefined) {
      resource['type'] = [
        {
          coding: [
            {
              system: dto.typeSystem,
              code: dto.typeCode,
              ...(typeDisplay === undefined ? {} : { display: typeDisplay }),
            },
          ],
        },
      ];
    }
    return resource as FhirResource;
  }

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
