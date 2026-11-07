import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { parseReference } from './fhir-reference';

export interface TransactionWrite {
  readonly method: 'POST' | 'PUT';
  readonly url: string;
  readonly resource: FhirResource;
  readonly fullUrl?: string;
  readonly ifMatch?: string;
  readonly ifNoneExist?: string;
}

interface TransactionEntryOutcome {
  readonly status: string;
  readonly location: string;
}

type TransactionConflictCode = 'ENCOUNTER_STATE_INVALID' | 'CONFLICT';

export function idFromLocation(location: string | undefined): string {
  return parseReference(location)?.id ?? '';
}

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

// HAPI has no row locks over REST: the whole bundle rolls back when any `ifMatch` fails, so a lost race leaves nothing half-written.
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
