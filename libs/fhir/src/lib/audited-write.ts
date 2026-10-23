import { randomUUID } from 'node:crypto';

import type { FhirClient, FhirResource } from './fhir-client.provider';
import { commitTransaction } from './fhir-transaction';
import { writeAuditEntry, type WriteActor } from './write-audit';

/** What an audited write needs besides the resource: who asked, and which service answers (`AuditEvent.source`). */
export interface AuditContext {
  readonly actor: WriteActor;
  readonly source: string;
}

export interface CreateAuditedOptions {
  /**
   * Search URL such as `Location?identifier=204` that makes the create conditional: the write
   * is a FHIR conditional update that creates the resource (under its new id) only while nothing
   * matches. When something does, HAPI refuses the whole transaction (`400`, "matching resource does
   * not match the provided ID") and nothing is written, so two concurrent creates cannot both win.
   */
  readonly onlyIfNoneMatches?: string;
}

/**
 * Creates `resource` and its `create` AuditEvent in one transaction (ADR-014): no write without its
 * journal entry. The id is assigned here (`PUT`, a UUID) rather than by HAPI, because the event names
 * the resource by id and must be written in the same bundle (see {@link FHIR_RESOURCE_ID_SYSTEM}).
 * Returns the resource as stored, with its id.
 */
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

/** Replaces `resource` (its `id` is the target) and writes its `update` AuditEvent in one transaction. */
export async function updateAudited(fhir: FhirClient, resource: FhirResource, audit: AuditContext): Promise<FhirResource> {
  const id = resource.id ?? '';
  await commitTransaction(
    fhir,
    [
      { method: 'PUT', url: `${resource.resourceType}/${id}`, resource },
      writeAuditEntry({ interaction: 'update', resourceType: resource.resourceType, resourceId: id, ...audit }),
    ],
    'CONFLICT',
  );
  return resource;
}

/**
 * Deletes `type/id` and writes its `delete` AuditEvent in one transaction. A `DELETE` of a missing id
 * succeeds in HAPI, so a caller that must answer 404 reads the resource first.
 */
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
