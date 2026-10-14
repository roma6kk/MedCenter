import type { FhirResource } from '@medcenter/fhir';

/**
 * A HAPI batch-response: one entry per request of the batch, in order. Real HAPI
 * answers every request entry, and the generator treats a missing entry as a
 * slot that was not written, so test doubles must answer the same way.
 */
export function batchResponseFor(
  bundle: FhirResource,
  statusOf: (index: number) => string = () => '201 Created',
): FhirResource {
  const requests = (bundle['entry'] as readonly unknown[] | undefined) ?? [];
  return {
    resourceType: 'Bundle',
    type: 'batch-response',
    entry: requests.map((_, index) => ({ response: { status: statusOf(index) } })),
  };
}
