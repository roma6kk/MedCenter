import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { parseReference } from './fhir-reference';

/**
 * One write inside an atomic FHIR `transaction` Bundle (pattern of
 * `apps/appointment-service/.../fhir-transaction.ts`). `ifMatch` is the
 * optimistic-lock check: the write applies only if the stored resource is still
 * at the version this service read; HAPI answers 412, surfacing as 409.
 * `ifNoneExist` is a FHIR conditional create: HAPI returns the matching
 * resource (`200`) instead of creating a duplicate (`201`).
 */
export interface TransactionWrite {
  readonly method: 'POST' | 'PUT';
  readonly url: string;
  readonly resource: FhirResource;
  /** `urn:uuid:` id so later entries in the same bundle can reference this one. */
  readonly fullUrl?: string;
  readonly ifMatch?: string;
  readonly ifNoneExist?: string;
}

/** Outcome of one bundle entry (`response.status` such as `201 Created`, `response.location`). */
export interface TransactionEntryOutcome {
  readonly status: string;
  readonly location: string;
}

export type TransactionConflictCode = 'ENCOUNTER_STATE_INVALID' | 'CONFLICT';

/**
 * Resource id from a `Location` (`Encounter/abc/_history/1` -> `abc`); an
 * absolute location (`http://hapi/fhir/Encounter/abc/_history/1`) resolves the same.
 */
export function idFromLocation(location: string | undefined): string {
  return parseReference(location)?.id ?? '';
}

/** `W/"<versionId>"` for the resource as read. Reads from HAPI always carry it. */
export function versionOf(resource: FhirResource): string {
  const meta = resource['meta'] as { versionId?: unknown } | undefined;
  if (typeof meta?.versionId !== 'string') {
    throw new InternalServerErrorException({
      errorCode: 'INTERNAL',
      message: `INTERNAL: ${resource.resourceType}/${resource.id ?? '?'} has no meta.versionId; optimistic lock impossible`,
    });
  }
  return `W/"${meta.versionId}"`;
}

/** Per-entry outcomes of a `transaction-response` Bundle, in request order. */
export function transactionOutcomes(response: FhirResource): readonly TransactionEntryOutcome[] {
  const entries = (response['entry'] as Array<{ response?: { status?: unknown; location?: unknown } }> | undefined) ?? [];
  return entries.map((entry) => ({
    status: typeof entry.response?.status === 'string' ? entry.response.status : '',
    location: typeof entry.response?.location === 'string' ? entry.response.location : '',
  }));
}

function toBundle(writes: readonly TransactionWrite[]): FhirResource {
  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: writes.map((write) => ({
      ...(write.fullUrl === undefined ? {} : { fullUrl: write.fullUrl }),
      resource: write.resource,
      request: {
        method: write.method,
        url: write.url,
        ...(write.ifMatch === undefined ? {} : { ifMatch: write.ifMatch }),
        ...(write.ifNoneExist === undefined ? {} : { ifNoneExist: write.ifNoneExist }),
      },
    })),
  };
}

/**
 * Commits all writes atomically via one `transaction` Bundle. HAPI has no row
 * locks over REST; it rolls the whole bundle back when any `ifMatch` fails, so
 * a lost race never leaves a half-written state. A 409 (HAPI 409/412) from the
 * bundle is reported as `conflictCode`; any other failure propagates.
 */
export async function commitTransaction(
  fhir: FhirClient,
  writes: readonly TransactionWrite[],
  conflictCode: TransactionConflictCode,
): Promise<FhirResource> {
  try {
    return await fhir.batch(toBundle(writes));
  } catch (error) {
    if (error instanceof FhirClientError && error.getStatus() === 409) {
      throw new ConflictException({
        errorCode: conflictCode,
        message: `${conflictCode}: resource was changed concurrently`,
      });
    }
    throw error;
  }
}
