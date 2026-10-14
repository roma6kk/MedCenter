import { Logger } from '@nestjs/common';
import type { FhirClient, FhirResource, FhirSearchResult } from '@medcenter/fhir';

/** HAPI's default `max_page_size` is 200: a larger `_count` is silently capped. */
export const FHIR_PAGE_SIZE = 200;

/**
 * Default hard stop for one logical query (2 000 resources). Enough for lists
 * of schedules and roles; slot searches raise it (`SLOT_SEARCH_MAX_PAGES`),
 * because a busy month of 5-minute slots does not fit 2 000 rows.
 */
export const FHIR_MAX_PAGES = 10;

const logger = new Logger('FhirSearch');

/** Resources of a search Bundle, without the entry wrappers. */
export function resourcesOf(result: FhirSearchResult): FhirResource[] {
  return (result.entry ?? []).map((entry) => entry.resource);
}

/** `Type/a,Type/b` — a comma-separated reference value is an OR in FHIR search. */
export function orReferences(resourceType: string, ids: readonly string[]): string {
  return ids.map((id) => `${resourceType}/${id}`).join(',');
}

/** Resources a paged search read, and whether the page cap cut the list short. */
export interface PagedSearchResult {
  readonly resources: FhirResource[];
  /** True when `maxPages` full pages were read, so the list may be incomplete. */
  readonly truncated: boolean;
}

/**
 * Reads every page of a search with `_count`/`_offset` paging. A single search
 * would stop at HAPI's page cap and silently drop the rest of the slots, so the
 * result says when the page cap cut the list: a caller that must not act on a
 * partial list (cache it, compare against it) checks `truncated`.
 * Callers that page must pass a deterministic `_sort`.
 */
export async function searchPages(
  fhirClient: FhirClient,
  resourceType: string,
  params: Readonly<Record<string, unknown>>,
  options: { readonly pageSize?: number; readonly maxPages?: number } = {},
): Promise<PagedSearchResult> {
  const pageSize = options.pageSize ?? FHIR_PAGE_SIZE;
  const maxPages = options.maxPages ?? FHIR_MAX_PAGES;
  const resources: FhirResource[] = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = resourcesOf(
      await fhirClient.search(resourceType, { ...params, _count: pageSize, _offset: pageIndex * pageSize }),
    );
    resources.push(...page);
    if (page.length < pageSize) {
      return { resources, truncated: false };
    }
  }
  logger.warn({ resourceType, params, returned: resources.length }, 'FHIR search truncated at the page cap');
  return { resources, truncated: true };
}

/** `searchPages` for lists where a cut-off is only logged (schedules, roles). */
export async function searchAllPages(
  fhirClient: FhirClient,
  resourceType: string,
  params: Readonly<Record<string, unknown>>,
  options: { readonly pageSize?: number; readonly maxPages?: number } = {},
): Promise<FhirResource[]> {
  return (await searchPages(fhirClient, resourceType, params, options)).resources;
}
