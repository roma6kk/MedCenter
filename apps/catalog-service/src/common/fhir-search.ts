import { Logger } from '@nestjs/common';
import type { FhirClient, FhirResource, FhirSearchResult } from '@medcenter/fhir';

/** HAPI's default `max_page_size` is 200: a larger `_count` is silently capped. */
export const FHIR_PAGE_SIZE = 200;

export const FHIR_MAX_PAGES = 10;

const logger = new Logger('FhirSearch');

export function resourcesOf(result: FhirSearchResult): FhirResource[] {
  return (result.entry ?? []).map((entry) => entry.resource);
}

export function orReferences(resourceType: string, ids: readonly string[]): string {
  return ids.map((id) => `${resourceType}/${id}`).join(',');
}

export interface PagedSearchResult {
  readonly resources: FhirResource[];
  readonly truncated: boolean;
}

/** Pages through a search; `truncated` tells a caller that must not act on a partial list (cache it) that the page cap cut it. */
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

export async function searchAllPages(
  fhirClient: FhirClient,
  resourceType: string,
  params: Readonly<Record<string, unknown>>,
  options: { readonly pageSize?: number; readonly maxPages?: number } = {},
): Promise<FhirResource[]> {
  return (await searchPages(fhirClient, resourceType, params, options)).resources;
}
