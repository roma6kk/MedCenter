import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import type { ErrorCode } from '@medcenter/contracts';

import { FhirClientError, type FhirClient, type FhirResource } from './fhir-client.provider';

/**
 * One write inside an atomic FHIR `transaction` Bundle (ADR-012/014). `ifMatch`
 * is the optimistic-lock check: the write applies only if the stored resource
 * is still at the version this service read (HAPI answers 412, reported as 409).
 */
export interface TransactionWrite {
  readonly method: 'POST' | 'PUT' | 'DELETE';
  readonly url: string;
  /** Absent for `DELETE`. */
  readonly resource?: FhirResource;
  /** `urn:uuid:` id so later entries in the same bundle can reference this one. */
  readonly fullUrl?: string;
  readonly ifMatch?: string;
}

const LOCATION_ID =
  /(?:^|\/)[A-Z][A-Za-z]+\/([A-Za-z0-9\-.]{1,64})(?:\/_history\/[A-Za-z0-9\-.]+)?$/;

/** Resource id of a transaction `response.location` (`Consent/abc/_history/1`, relative or absolute); `''` if none. */
export function idFromLocation(location: string | undefined): string {
  return LOCATION_ID.exec(location ?? '')?.[1] ?? '';
}

/** `W/"<versionId>"` for the resource as read. Reads from HAPI always carry it. */
export function versionOf(resource: FhirResource): string {
  const meta = resource['meta'] as { versionId?: unknown } | undefined;
  if (typeof meta?.versionId !== 'string') {
    throw new InternalServerErrorException({
      errorCode: 'INTERNAL',
      message: `${resource.resourceType}/${resource.id ?? '?'} has no meta.versionId; optimistic lock impossible`,
    });
  }
  return `W/"${meta.versionId}"`;
}

/**
 * Commits all writes atomically in one `transaction` Bundle: HAPI rolls the
 * whole bundle back if any `ifMatch` fails. A 409/412 is reported as
 * `conflictCode`; every other failure propagates.
 */
export async function commitTransaction(
  fhir: FhirClient,
  writes: readonly TransactionWrite[],
  conflictCode: ErrorCode,
): Promise<FhirResource> {
  const bundle: FhirResource = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: writes.map((write) => ({
      ...(write.fullUrl === undefined ? {} : { fullUrl: write.fullUrl }),
      ...(write.resource === undefined ? {} : { resource: write.resource }),
      request: {
        method: write.method,
        url: write.url,
        ...(write.ifMatch === undefined ? {} : { ifMatch: write.ifMatch }),
      },
    })),
  };
  try {
    return await fhir.batch(bundle);
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
