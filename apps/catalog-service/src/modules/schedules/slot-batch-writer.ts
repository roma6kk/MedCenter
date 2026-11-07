import type { FhirClient, FhirResource } from '@medcenter/fhir';

export const SLOT_BATCH_SIZE = 200;

interface BatchResponseEntry {
  readonly response?: {
    readonly status?: string;
    readonly outcome?: { readonly issue?: ReadonlyArray<{ readonly diagnostics?: string }> };
  };
}

export interface BatchWriteResult {
  readonly generated: number;
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

/** Batch, not a per-slot loop: a 90-day horizon would otherwise issue thousands of sequential calls. */
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
    failures.push(...Array.from({ length: Math.max(0, chunk.length - entries.length) }, () => 'no response entry'));
  }
  return { generated, failures };
}
