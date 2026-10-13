import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

/**
 * One write inside an atomic FHIR `transaction` Bundle. `ifMatch` is the
 * optimistic-lock check: the write is applied only if the stored resource is
 * still at the version this service read (HAPI answers 412, which surfaces as
 * a 409 `CONFLICT`).
 */
export interface TransactionWrite {
  readonly method: 'POST' | 'PUT';
  readonly url: string;
  readonly resource: FhirResource;
  /** `urn:uuid:` id so later entries in the same bundle can reference this one. */
  readonly fullUrl?: string;
  readonly ifMatch?: string;
}

/** Id of a FHIR reference (`Slot/abc` -> `abc`). */
export function referenceId(reference: unknown): string {
  return typeof reference === 'string' ? reference.split('/').pop() ?? '' : '';
}

/** Resource id from a `Location` header (`Appointment/abc/_history/1` -> `abc`). */
export function idFromLocation(location: string | undefined): string {
  return location?.split('/')[1] ?? '';
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
 * Commits all writes atomically via one `transaction` Bundle (ADR-012). HAPI
 * rolls the whole bundle back if any `ifMatch` fails, so a lost race never
 * leaves a half-booked state. A 409 from the bundle is reported as
 * `conflictCode`.
 */
export async function commitTransaction(
  fhir: FhirClient,
  writes: readonly TransactionWrite[],
  conflictCode: 'SLOT_CONFLICT' | 'CONFLICT' | 'APPOINTMENT_NOT_CANCELLABLE',
): Promise<FhirResource> {
  const bundle: FhirResource = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: writes.map((write) => ({
      ...(write.fullUrl === undefined ? {} : { fullUrl: write.fullUrl }),
      resource: write.resource,
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
