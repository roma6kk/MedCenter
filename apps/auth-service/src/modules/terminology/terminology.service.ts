import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { buildPaginatedResponse, type PaginatedResponseDto } from '@medcenter/contracts';
import { FHIR_CLIENT, FhirClientError, type FhirClient } from '@medcenter/fhir';

import { DEFAULT_EXPAND_COUNT, type ExpandQueryDto } from './dto/terminology-query.dto';
import type {
  ConceptDto,
  ExpansionResponseDto,
  ValidationResponseDto,
  ValueSetSummaryDto,
} from './dto/terminology-response.dto';
import { FHIR_BY_VALUE_SET_PREFIX, hasValidCodeShape, seededValueSetOf } from './seeded-value-sets';
import { TERMINOLOGY_CACHE, type TerminologyCache } from './terminology-cache';
import { toConcepts, toValidation, toValueSetSummaries } from './value-set-parser';

/** Reference data changes only when a snapshot is imported (ADR-016), so an hour is safe. */
export const EXPANSION_TTL_SECONDS = 3600;

/**
 * Key namespace of the cached expansions (`…:expand:<page>` and `…:expand-all:<url>`).
 * The snapshot import sweeps it, so every key is built from this one constant.
 */
export const EXPANSION_CACHE_PREFIX = 'terminology:expand';

const LIST_PAGE_SIZE = 100;

/** Concepts requested per HAPI call when a whole ValueSet is read (HAPI's own cap is 1000). */
const SCAN_PAGE_SIZE = 500;
/** Upper bound of a whole-ValueSet read; larger sets are searched only up to this many concepts. */
const MAX_SCANNED_CONCEPTS = 10_000;

/**
 * HAPI answers an unknown ValueSet (or a code system it cannot expand) with
 * one of these. `400` is deliberately absent: it means HAPI rejected a request
 * this service built, a defect that `FhirClientError` reports as `500 INTERNAL`
 * and that must not pass for "not in the seed".
 */
const UNKNOWN_UPSTREAM_STATUSES: ReadonlySet<number> = new Set([404, 422]);

/** HAPI refused the request as one for an unknown ValueSet / code — as opposed to being down or rejecting our request. */
function isUnknownToUpstream(error: unknown): error is FhirClientError {
  return (
    error instanceof FhirClientError &&
    error.upstreamStatus !== undefined &&
    UNKNOWN_UPSTREAM_STATUSES.has(error.upstreamStatus)
  );
}

function isCachedExpansion(value: unknown): value is ExpansionResponseDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { readonly valueSet?: unknown; readonly total?: unknown; readonly items?: unknown };
  return typeof candidate.valueSet === 'string' && typeof candidate.total === 'number' && Array.isArray(candidate.items);
}

/**
 * HAPI's in-memory `$expand` matches `filter` against the display text only, so
 * a doctor typing an ICD-10 code (`J06`) would find nothing. The text filter
 * is therefore applied here: a concept matches when its code starts with, or
 * its display contains, the (case-insensitive) text.
 */
function matcherOf(filter: string): (concept: ConceptDto) => boolean {
  const needle = filter.toLowerCase();
  return (concept) =>
    concept.code.toLowerCase().startsWith(needle) || (concept.display?.toLowerCase().includes(needle) ?? false);
}

/**
 * Terminology API (API §2.3, FR-018, ADR-002/016): a read-only window onto the
 * `fhir.by` ValueSets the seed publishes to HAPI. HAPI stays the single source
 * of truth — nothing is copied into the `auth` schema.
 */
@Injectable()
export class TerminologyService {
  private readonly logger = new Logger(TerminologyService.name);

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    @Inject(TERMINOLOGY_CACHE) private readonly cache: TerminologyCache,
  ) {}

  /** API 2.3.1 — one page: the seed holds a handful of ValueSets. */
  async listValueSets(): Promise<PaginatedResponseDto<ValueSetSummaryDto>> {
    const found = await this.fhir.search('ValueSet', {
      'url:below': FHIR_BY_VALUE_SET_PREFIX,
      _count: LIST_PAGE_SIZE,
      _elements: 'url,name,title,version,status',
    });
    const items = toValueSetSummaries(found);
    return buildPaginatedResponse(items, {
      page: 1,
      pageSize: LIST_PAGE_SIZE,
      totalItems: items.length,
      totalPages: 1,
    });
  }

  /**
   * API 2.3.2 — `ValueSet/$expand`. Without a filter HAPI pages the answer; with
   * one the whole (cached) expansion is searched, so keystrokes of a combobox
   * cost one HAPI call per hour, not one each.
   */
  async expand(url: string, query: ExpandQueryDto): Promise<ExpansionResponseDto> {
    const count = query.count ?? DEFAULT_EXPAND_COUNT;
    const offset = query.offset ?? 0;
    const filter = query.filter?.trim() ?? '';
    if (filter === '') {
      return this.cachedPage(url, count, offset);
    }
    const matches = (await this.allConcepts(url)).filter(matcherOf(filter));
    return { valueSet: url, total: matches.length, items: matches.slice(offset, offset + count) };
  }

  /** API 2.3.3 — a pair outside the seed is `valid: false`, not an error: the caller is asking a question. */
  async validate(system: string, code: string): Promise<ValidationResponseDto> {
    const valueSet = seededValueSetOf(system);
    if (valueSet === undefined || !hasValidCodeShape(system, code)) {
      return { system, code, valid: false };
    }
    try {
      const result = await this.fhir.operation('ValueSet', '$validate-code', { url: valueSet, system, code });
      return { system, code, ...toValidation(result) };
    } catch (error: unknown) {
      if (isUnknownToUpstream(error)) {
        this.logger.warn({ valueSet, system, status: error.upstreamStatus }, 'validate-code answered as unknown');
        return { system, code, valid: false };
      }
      throw error;
    }
  }

  private async cachedPage(url: string, count: number, offset: number): Promise<ExpansionResponseDto> {
    const key = `${EXPANSION_CACHE_PREFIX}:${JSON.stringify({ url, count, offset })}`;
    const cached = await this.readCached(key, isCachedExpansion);
    if (cached !== null) {
      return cached;
    }
    const page = await this.fetchPage(url, count, offset);
    await this.cache.set(key, JSON.stringify(page), EXPANSION_TTL_SECONDS);
    return page;
  }

  private async allConcepts(url: string): Promise<ReadonlyArray<ConceptDto>> {
    const key = `${EXPANSION_CACHE_PREFIX}-all:${url}`;
    const cached = await this.readCached(key, (value): value is ConceptDto[] => Array.isArray(value));
    if (cached !== null) {
      return cached;
    }
    const concepts: ConceptDto[] = [];
    let total = 0;
    for (let offset = 0; offset < MAX_SCANNED_CONCEPTS; offset += SCAN_PAGE_SIZE) {
      const page = await this.fetchPage(url, SCAN_PAGE_SIZE, offset);
      total = page.total;
      concepts.push(...page.items);
      if (page.items.length === 0 || concepts.length >= page.total) {
        break;
      }
    }
    if (concepts.length < total) {
      // The cap is a safety valve, not a feature: a filter over this set silently misses the rest, so say so.
      this.logger.warn({ url, scanned: concepts.length, total }, 'ValueSet exceeds the scan cap; the text filter sees only its first concepts');
    }
    await this.cache.set(key, JSON.stringify(concepts), EXPANSION_TTL_SECONDS);
    return concepts;
  }

  private async fetchPage(url: string, count: number, offset: number): Promise<ExpansionResponseDto> {
    try {
      const expanded = await this.fhir.operation('ValueSet', '$expand', { url, count, offset });
      const { total, items } = toConcepts(expanded);
      return { valueSet: url, total, items };
    } catch (error: unknown) {
      if (isUnknownToUpstream(error)) {
        throw new NotFoundException({
          errorCode: 'NOT_FOUND',
          message: `NOT_FOUND: ValueSet ${url} is not in the terminology seed`,
        });
      }
      throw error;
    }
  }

  private async readCached<T>(key: string, isValid: (value: unknown) => value is T): Promise<T | null> {
    const raw = await this.cache.get(key);
    if (raw === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return isValid(parsed) ? parsed : null;
    } catch {
      // A value we did not write (or a truncated one) is a miss, never an error.
      return null;
    }
  }
}
