import type { FhirClient, FhirResource } from '@medcenter/fhir';

/** One entry of a committed transaction Bundle, as the service sent it. */
export interface SentEntry {
  readonly request: { readonly method: string; readonly url: string; readonly ifMatch?: string };
  readonly resource?: FhirResource;
}

/** `FhirClient.batch` answering a transaction (or batch) Bundle as HAPI does: `200` for a PUT, `201` for a POST, `204` for a DELETE. */
export function transactionResponder(): (bundle: FhirResource) => Promise<FhirResource> {
  return async (bundle) => {
    const entries = bundle['entry'] as SentEntry[];
    return {
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: entries.map(({ request }) => ({
        response: { status: request.method === 'POST' ? '201 Created' : request.method === 'PUT' ? '200 OK' : '204 No Content' },
      })),
    } as FhirResource;
  };
}

/** Entries of the `call`-th committed transaction. */
export function committedEntries(fhir: jest.Mocked<FhirClient>, call = 0): readonly SentEntry[] {
  return (fhir.batch.mock.calls[call]?.[0] as unknown as { entry?: SentEntry[] } | undefined)?.entry ?? [];
}

/** The AuditEvent of the `call`-th committed transaction. */
export function committedAudit(fhir: jest.Mocked<FhirClient>, call = 0): FhirResource {
  const audit = committedEntries(fhir, call).find((entry) => entry.resource?.resourceType === 'AuditEvent')?.resource;
  if (audit === undefined) {
    throw new Error('the transaction carries no AuditEvent');
  }
  return audit;
}

/** `METHOD url` of every entry of the `call`-th committed transaction. */
export function committedWrites(fhir: jest.Mocked<FhirClient>, call = 0): string[] {
  return committedEntries(fhir, call).map((entry) => `${entry.request.method} ${entry.request.url}`);
}

/** What an AuditEvent names as the changed resource: `{ what: { type, identifier: { value: id } } }`. */
export function auditedResource(type: string, id: unknown): Record<string, unknown> {
  return { what: { type, identifier: { value: id } } };
}
