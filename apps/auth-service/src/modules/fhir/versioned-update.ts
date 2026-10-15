import { InternalServerErrorException } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

/** `W/"<versionId>"` of the resource as read. Reads from HAPI always carry it. */
export function versionOf(resource: FhirResource): string {
  const meta = resource['meta'] as { readonly versionId?: unknown } | undefined;
  if (typeof meta?.versionId !== 'string' || meta.versionId.length === 0) {
    throw new InternalServerErrorException({
      errorCode: 'INTERNAL',
      message: `${resource.resourceType}/${resource.id ?? '?'} has no meta.versionId; optimistic lock impossible`,
    });
  }
  return `W/"${meta.versionId}"`;
}

/**
 * Replaces `read` with `next` only while the stored resource is still at the
 * version that was read (ADR-012: the optimistic `If-Match` of the project,
 * carried by a one-entry `transaction` Bundle because `FhirClient.update`
 * cannot send headers). A concurrent edit makes HAPI answer 412, which the
 * client surfaces as `409 CONFLICT` and nothing is written.
 */
export async function updateIfUnchanged(fhir: FhirClient, read: FhirResource, next: FhirResource): Promise<void> {
  if (typeof read.id !== 'string' || read.id.length === 0) {
    throw new InternalServerErrorException({
      errorCode: 'INTERNAL',
      message: `${read.resourceType} read from HAPI has no id; it cannot be updated`,
    });
  }
  await fhir.batch({
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        resource: next,
        request: { method: 'PUT', url: `${read.resourceType}/${encodeURIComponent(read.id)}`, ifMatch: versionOf(read) },
      },
    ],
  });
}
