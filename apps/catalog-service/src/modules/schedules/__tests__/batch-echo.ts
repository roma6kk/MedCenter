import type { FhirResource } from '@medcenter/fhir';

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
