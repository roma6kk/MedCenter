import type { FhirHttp, FhirResource } from '../shared/fhir-http';

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

export function isTermIndexedCodeSystem(resource: FhirResource): boolean {
  if (resource.resourceType !== 'CodeSystem') {
    return false;
  }
  const content = resource['content'];
  return content === undefined || content === 'complete' || content === 'not-present';
}

function countConceptsIn(concepts: unknown): number {
  if (!Array.isArray(concepts)) {
    return 0;
  }
  return concepts.reduce<number>(
    (total, concept) => total + 1 + countConceptsIn((concept as { concept?: unknown } | null)?.concept),
    0,
  );
}

export function countConcepts(resource: FhirResource): number {
  return countConceptsIn(resource['concept']);
}

// Deleting drops HAPI's term-index rows that a PUT cannot restore: never do it to a real terminology import.
export function isLegacySeedCopy(existing: FhirResource, desired: CanonicalResource): boolean {
  if (existing['content'] !== 'complete') {
    return false;
  }
  const listed = countConcepts(existing);
  return listed > 0 && listed <= countConcepts(desired);
}

function describeForeignCopy(existing: FhirResource, desired: CanonicalResource): string {
  return (
    `${desired.resourceType}/${existing.id ?? '?'} (${desired.url}) is a term-indexed CodeSystem ` +
    `(content ${String(existing['content'])}, ${countConcepts(existing)} concepts listed) that does not look like a copy of ` +
    `the seed snapshot (${countConcepts(desired)} concepts); it may be a real terminology import, ` +
    'so the seed refuses to delete it. Delete it yourself if it is stale, or seed another server (SEED_FHIR_BASE_URL)'
  );
}

export function planCanonicalUpsert(desired: CanonicalResource, existing: readonly FhirResource[]): UpsertPlan {
  const desiredIsIndexed = isTermIndexedCodeSystem(desired);
  const indexed = existing.filter((resource) => !desiredIsIndexed && isTermIndexedCodeSystem(resource));
  const foreign = indexed.find((resource) => !isLegacySeedCopy(resource, desired));
  if (foreign !== undefined) {
    throw new Error(describeForeignCopy(foreign, desired));
  }
  const retire = indexed;
  const keep = existing.filter((resource) => !retire.includes(resource));
  if (keep.length > 1) {
    const ids = keep.map((resource) => resource.id ?? '?').join(', ');
    throw new Error(
      `${desired.resourceType} ${desired.url} exists ${keep.length} times (ids ${ids}); resolve the duplicates manually before seeding`,
    );
  }
  const current = keep[0]?.id;
  return {
    id: current ?? desired.id,
    action: current === undefined ? 'created' : 'updated',
    retireIds: retire.map((resource) => resource.id ?? '').filter((id) => id.length > 0),
  };
}

export async function planUpsert(http: FhirHttp, desired: CanonicalResource): Promise<UpsertPlan> {
  return planCanonicalUpsert(desired, await http.search(desired.resourceType, { url: desired.url }));
}

export async function applyUpsert(http: FhirHttp, desired: CanonicalResource, plan: UpsertPlan): Promise<UpsertResult> {
  for (const id of plan.retireIds) {
    console.log(`Retiring legacy term-indexed ${desired.resourceType}/${id} (${desired.url})`);
    await http.delete(desired.resourceType, id);
  }
  await http.put({ ...desired, id: plan.id });
  return { ...plan, resourceType: desired.resourceType, url: desired.url };
}

export async function upsertCanonical(http: FhirHttp, desired: CanonicalResource): Promise<UpsertResult> {
  return applyUpsert(http, desired, await planUpsert(http, desired));
}
