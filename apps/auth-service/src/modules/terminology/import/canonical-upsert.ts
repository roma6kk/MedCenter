import type { FhirClient, FhirResource } from '@medcenter/fhir';

export interface CanonicalResource extends FhirResource {
  readonly id: string;
  readonly url: string;
}

export interface UpsertPlan {
  readonly id: string;
  readonly action: 'created' | 'updated';
  readonly retireIds: readonly string[];
}

export interface UpsertResult extends UpsertPlan {
  readonly resourceType: string;
  readonly url: string;
}

/** A CodeSystem HAPI has indexed into its terminology tables (`content` complete / not-present / absent) is expanded through those tables, so a legacy copy must be deleted before the upsert. */
export function isTermIndexedCodeSystem(resource: FhirResource): boolean {
  if (resource.resourceType !== 'CodeSystem') {
    return false;
  }
  const content = resource['content'];
  return content === undefined || content === 'complete' || content === 'not-present';
}

export function planCanonicalUpsert(desired: CanonicalResource, existing: readonly FhirResource[]): UpsertPlan {
  const desiredIsIndexed = isTermIndexedCodeSystem(desired);
  const retire = existing.filter((resource) => !desiredIsIndexed && isTermIndexedCodeSystem(resource));
  const keep = existing.filter((resource) => !retire.includes(resource));
  if (keep.length > 1) {
    const ids = keep.map((resource) => resource.id ?? '?').join(', ');
    throw new Error(
      `${desired.resourceType} ${desired.url} exists ${keep.length} times (ids ${ids}); resolve the duplicates manually before importing`,
    );
  }
  const current = keep[0]?.id;
  return {
    id: current ?? desired.id,
    action: current === undefined ? 'created' : 'updated',
    retireIds: retire.map((resource) => resource.id ?? '').filter((id) => id.length > 0),
  };
}

export async function findByCanonical(
  fhir: FhirClient,
  resourceType: string,
  url: string,
): Promise<readonly FhirResource[]> {
  const found = await fhir.search(resourceType, { url });
  return (found.entry ?? []).map((entry) => entry.resource);
}

export async function upsertCanonical(fhir: FhirClient, desired: CanonicalResource): Promise<UpsertResult> {
  const existing = await findByCanonical(fhir, desired.resourceType, desired.url);
  const plan = planCanonicalUpsert(desired, existing);
  for (const id of plan.retireIds) {
    await fhir.delete(desired.resourceType, id);
  }
  await fhir.update(desired.resourceType, plan.id, { ...desired, id: plan.id });
  return { ...plan, resourceType: desired.resourceType, url: desired.url };
}
