import { randomUUID } from 'node:crypto';

import type { FhirClient, FhirResource } from './fhir-client.provider';
import { commitTransaction, versionOf } from './fhir-transaction';
import { writeAuditEntry, type WriteActor } from './write-audit';

export interface AuditContext {
  readonly actor: WriteActor;
  readonly source: string;
}

export interface CreateAuditedOptions {
  /** Makes the create conditional: HAPI refuses the whole transaction when something matches, so two concurrent creates cannot both win. */
  readonly onlyIfNoneMatches?: string;
}

/** The id is assigned here, not by HAPI: the AuditEvent names the resource by id in the same bundle. */
export async function createAudited(
  fhir: FhirClient,
  resource: FhirResource,
  audit: AuditContext,
  options: CreateAuditedOptions = {},
): Promise<FhirResource> {
  const id = randomUUID();
  const created: FhirResource = { ...resource, id };
  await commitTransaction(
    fhir,
    [
      { method: 'PUT', url: options.onlyIfNoneMatches ?? `${resource.resourceType}/${id}`, resource: created },
      writeAuditEntry({ interaction: 'create', resourceType: resource.resourceType, resourceId: id, ...audit }),
    ],
    'CONFLICT',
  );
  return created;
}

/** A resource read with a `meta.versionId` is written `If-Match` it: a concurrent change becomes 409 instead of being silently undone. */
export async function updateAudited(fhir: FhirClient, resource: FhirResource, audit: AuditContext): Promise<FhirResource> {
  const id = resource.id ?? '';
  const meta = resource['meta'] as { versionId?: unknown } | undefined;
  const ifMatch = typeof meta?.versionId === 'string' ? versionOf(resource) : undefined;
  await commitTransaction(
    fhir,
    [
      { method: 'PUT', url: `${resource.resourceType}/${id}`, resource, ...(ifMatch === undefined ? {} : { ifMatch }) },
      writeAuditEntry({ interaction: 'update', resourceType: resource.resourceType, resourceId: id, ...audit }),
    ],
    'CONFLICT',
  );
  return resource;
}

export async function deleteAudited(fhir: FhirClient, type: string, id: string, audit: AuditContext): Promise<void> {
  await commitTransaction(
    fhir,
    [
      { method: 'DELETE', url: `${type}/${id}` },
      writeAuditEntry({ interaction: 'delete', resourceType: type, resourceId: id, ...audit }),
    ],
    'CONFLICT',
  );
}
