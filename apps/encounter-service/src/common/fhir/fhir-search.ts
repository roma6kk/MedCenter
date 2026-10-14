import type { FhirResource, FhirSearchResult } from '@medcenter/fhir';

/** Every resource of a search Bundle — matches and `_include`/`_revinclude` alike. */
export function resourcesOf(result: FhirSearchResult): FhirResource[] {
  return (result.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is FhirResource => typeof resource?.resourceType === 'string');
}

/** Resources of one type from a search Bundle (the match type never collides with the included types here). */
export function resourcesOfType(result: FhirSearchResult, resourceType: string): FhirResource[] {
  return resourcesOf(result).filter((resource) => resource.resourceType === resourceType);
}

/** `Bundle.total` when HAPI reported it (`_total=accurate` / `_summary=count`), else `undefined`. */
export function totalOf(result: FhirSearchResult): number | undefined {
  return typeof result.total === 'number' ? result.total : undefined;
}
