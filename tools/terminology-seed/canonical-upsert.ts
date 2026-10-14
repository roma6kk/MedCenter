import type { FhirHttp, FhirResource } from '../shared/fhir-http';

/**
 * Idempotent upsert of a canonical (`url`-identified) terminology resource.
 *
 * A canonical resource is identified by its `url`, not by its id, and earlier
 * seed runs created resources with server-assigned ids via `POST`. The upsert
 * therefore resolves the target id by canonical: an existing resource is
 * updated in place, otherwise the deterministic id is created — re-running the
 * seed never yields a second resource for the same canonical.
 */

export interface CanonicalResource extends FhirResource {
  readonly id: string;
  readonly url: string;
}

export interface UpsertPlan {
  readonly id: string;
  readonly action: 'created' | 'updated';
  /** Ids of legacy resources that must be deleted before the upsert (see `isTermIndexedCodeSystem`). */
  readonly retireIds: readonly string[];
}

export interface UpsertResult extends UpsertPlan {
  readonly resourceType: string;
  readonly url: string;
}

/**
 * A CodeSystem HAPI has indexed into its terminology tables (`content`
 * complete / not-present / absent). Such a canonical is expanded through the
 * database path, which needs Hibernate Search — so a legacy `complete` copy
 * left by the old POST-based seed would keep `$expand` failing even after the
 * resource is rewritten as `fragment`. Only deleting it drops the index rows.
 */
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

/** Concepts a CodeSystem body lists, nested ones included (`0` when it lists none). */
export function countConcepts(resource: FhirResource): number {
  return countConceptsIn(resource['concept']);
}

/**
 * Whether a term-indexed CodeSystem is recognisably the seed's own legacy copy
 * and may therefore be deleted. Deleting drops HAPI's term-index rows, which a
 * later `PUT` cannot bring back, so the seed must not do it to a real
 * terminology import (ADR-002/016: on a stand with the real НСИ / МКБ-10 / АТХ
 * the seed is not the owner). The proof is in the body: the old POST-based seed
 * published `content: complete` with the snapshot's concepts, so a copy lists
 * some concepts and never more than the snapshot does. `not-present` (concepts
 * live only in HAPI's tables), an empty list or a larger one cannot be proven
 * to be ours and is refused.
 */
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

/**
 * Pure decision: which id to write, and which legacy copies to retire first.
 * Throws instead of planning the deletion of a copy that is not recognisably the seed's own.
 */
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

/** Reads what the server holds for the canonical and decides; writes nothing (so a refusal touches nothing). */
export async function planUpsert(http: FhirHttp, desired: CanonicalResource): Promise<UpsertPlan> {
  return planCanonicalUpsert(desired, await http.search(desired.resourceType, { url: desired.url }));
}

/** Carries out a plan: retires the legacy copies it names, then `PUT`s the resource. */
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
