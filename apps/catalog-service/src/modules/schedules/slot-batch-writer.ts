import type { FhirClient, FhirResource } from '@medcenter/fhir';

/** Slots per FHIR batch Bundle (one HTTP request per chunk, NFR-005). */
export const SLOT_BATCH_SIZE = 200;

/** What a batch Bundle answers for one request entry. */
interface BatchResponseEntry {
  readonly response?: {
    readonly status?: string;
    readonly outcome?: { readonly issue?: ReadonlyArray<{ readonly diagnostics?: string }> };
  };
}

/** Result of writing slots: how many HAPI confirmed, and why each of the others was not. */
export interface BatchWriteResult {
  readonly generated: number;
  /** One short reason per slot that was not confirmed (HTTP status and the first outcome detail). */
  readonly failures: readonly string[];
}

function isCreated(entry: BatchResponseEntry): boolean {
  const status = entry.response?.status;
  return typeof status === 'string' && status.startsWith('2');
}

function describeFailure(entry: BatchResponseEntry): string {
  const status = entry.response?.status ?? 'no status';
  const detail = entry.response?.outcome?.issue?.[0]?.diagnostics;
  return detail === undefined ? status : `${status}: ${detail}`;
}

/**
 * Writes slots in FHIR batch Bundles (one HTTP request per chunk, NFR-005 — a
 * per-slot loop would issue thousands of sequential calls for a 90-day horizon).
 * `type: 'batch'` keeps per-entry outcomes: a failed entry does not roll back the
 * rest, so the caller must look at `failures` — a slot HAPI did not confirm is not
 * "skipped", it is missing. Entries are `PUT Slot/{id}` on the deterministic id,
 * so a concurrent generate with the same id updates instead of duplicating.
 */
export async function writeSlotBatches(
  fhirClient: FhirClient,
  slots: readonly FhirResource[],
): Promise<BatchWriteResult> {
  let generated = 0;
  const failures: string[] = [];
  for (let offset = 0; offset < slots.length; offset += SLOT_BATCH_SIZE) {
    const chunk = slots.slice(offset, offset + SLOT_BATCH_SIZE);
    const response = await fhirClient.batch({
      resourceType: 'Bundle',
      type: 'batch',
      entry: chunk.map((slot) => ({ request: { method: 'PUT', url: `Slot/${slot.id}` }, resource: slot })),
    });
    const entries = (response['entry'] as readonly BatchResponseEntry[] | undefined) ?? [];
    generated += entries.filter(isCreated).length;
    failures.push(...entries.filter((entry) => !isCreated(entry)).map(describeFailure));
    // A batch-response has one entry per request; a short answer leaves slots unconfirmed.
    failures.push(...Array.from({ length: Math.max(0, chunk.length - entries.length) }, () => 'no response entry'));
  }
  return { generated, failures };
}
