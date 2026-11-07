import type { FhirResource, FhirSearchResult } from '@medcenter/fhir';

export function resourcesOf(result: FhirSearchResult): FhirResource[] {
  return (result.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is FhirResource => typeof resource?.resourceType === 'string');
}

export function resourcesOfType(result: FhirSearchResult, resourceType: string): FhirResource[] {
  return resourcesOf(result).filter((resource) => resource.resourceType === resourceType);
}

export function totalOf(result: FhirSearchResult): number | undefined {
  return typeof result.total === 'number' ? result.total : undefined;
}
