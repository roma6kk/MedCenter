import { BadGatewayException, ConflictException, Logger } from '@nestjs/common';
import { deleteAudited, updateAudited, type AuditContext, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { FHIR_PAGE_SIZE, resourcesOf } from '../../common/fhir-search';

/** One batch round trip removes up to a page of slots; 200 rounds cover 40 000 slots (a 90-day horizon is < 27 000). */
const MAX_DELETE_ROUNDS = 200;

/** R4 `Slot.status` of a slot that must never be offered again but cannot be deleted. */
const RETIRED_SLOT_STATUS = 'entered-in-error';

const HTTP_CONFLICT = 409;
const HTTP_PRECONDITION_FAILED = 412;

const logger = new Logger('ScheduleRemoval');

interface BatchAnswer {
  readonly response?: { readonly status?: string };
}

function scheduleInUse(scheduleId: string, why: string): ConflictException {
  return new ConflictException({ errorCode: 'SCHEDULE_IN_USE', message: `SCHEDULE_IN_USE: schedule ${scheduleId} ${why}` });
}

function gatewayError(scheduleId: string, detail: string): BadGatewayException {
  return new BadGatewayException({ errorCode: 'INTERNAL', message: `INTERNAL: schedule ${scheduleId}: ${detail}` });
}

/** HTTP code of a batch answer (`"409 Conflict"` -> 409); 0 when HAPI sent no usable status. */
function codeOf(answer: BatchAnswer | undefined): number {
  const code = Number.parseInt(answer?.response?.status ?? '', 10);
  return Number.isNaN(code) ? 0 : code;
}

const isSuccess = (code: number): boolean => code >= 200 && code < 300;
const isGone = (code: number): boolean => isSuccess(code) || code === 404 || code === 410;

async function hasSlots(fhirClient: FhirClient, scheduleId: string, status?: string): Promise<boolean> {
  const result = await fhirClient.search('Slot', {
    schedule: `Schedule/${scheduleId}`,
    ...(status === undefined ? {} : { status }),
    _count: 1,
  });
  return resourcesOf(result).length > 0;
}

/** Sends one batch Bundle and returns the HTTP code HAPI answered for each entry, in request order. */
async function submitBatch(fhirClient: FhirClient, scheduleId: string, entry: readonly object[]): Promise<number[]> {
  const response = await fhirClient.batch({ resourceType: 'Bundle', type: 'batch', entry: [...entry] });
  const answers = (response['entry'] as readonly BatchAnswer[] | undefined) ?? [];
  if (answers.length !== entry.length) {
    throw gatewayError(scheduleId, 'HAPI did not answer every slot request of the batch');
  }
  return answers.map(codeOf);
}

/**
 * Cancelling an appointment frees its slot but keeps `Appointment.slot`, so HAPI's
 * referential integrity refuses to delete that slot (409). Such a slot is retired
 * (`entered-in-error`) under an If-Match on the version just read: a booking that
 * wins the race bumps the version, the write fails and nothing is overwritten.
 */
async function retireSlots(fhirClient: FhirClient, scheduleId: string, slots: readonly FhirResource[]): Promise<void> {
  const entries = slots.map((slot) => {
    const versionId = (slot['meta'] as { versionId?: string } | undefined)?.versionId;
    return {
      resource: { ...slot, status: RETIRED_SLOT_STATUS },
      request: { method: 'PUT', url: `Slot/${slot.id}`, ...(versionId === undefined ? {} : { ifMatch: `W/"${versionId}"` }) },
    };
  });
  const codes = await submitBatch(fhirClient, scheduleId, entries);
  if (codes.some((code) => code === HTTP_CONFLICT || code === HTTP_PRECONDITION_FAILED)) {
    throw scheduleInUse(scheduleId, 'has a slot that changed (was booked) while it was being removed; try again');
  }
  if (!codes.every(isSuccess)) {
    throw gatewayError(scheduleId, 'slots that appointments still reference could not be retired');
  }
  logger.log({ scheduleId, retired: slots.length }, 'Slots referenced by appointments were retired instead of deleted');
}

/** One round: batch-deletes `slots`; the ones HAPI keeps (409) are retired, any other failure aborts. */
async function deleteOrRetire(fhirClient: FhirClient, scheduleId: string, slots: readonly FhirResource[]): Promise<void> {
  const codes = await submitBatch(
    fhirClient,
    scheduleId,
    slots.map((slot) => ({ request: { method: 'DELETE', url: `Slot/${slot.id}` } })),
  );
  if (!codes.every((code) => isGone(code) || code === HTTP_CONFLICT)) {
    throw gatewayError(scheduleId, 'free slots were not all removed');
  }
  const referenced = slots.filter((_slot, index) => codes[index] === HTTP_CONFLICT);
  if (referenced.length > 0) {
    await retireSlots(fhirClient, scheduleId, referenced);
  }
}

/** Removes the free slots of a schedule page after page; a retired slot leaves the `free` set, so the loop advances. */
async function removeFreeSlots(fhirClient: FhirClient, scheduleId: string): Promise<void> {
  for (let round = 0; round < MAX_DELETE_ROUNDS; round += 1) {
    const page = await fhirClient.search('Slot', { schedule: `Schedule/${scheduleId}`, status: 'free', _count: FHIR_PAGE_SIZE });
    const slots = resourcesOf(page);
    if (slots.length === 0) {
      return;
    }
    await deleteOrRetire(fhirClient, scheduleId, slots);
  }
  throw gatewayError(scheduleId, 'has more slots than one removal handles');
}

/** `active=false` hides the schedule from slot searches and the overlap check; it stays for the slots HAPI keeps. */
async function deactivateSchedule(fhirClient: FhirClient, scheduleId: string, audit: AuditContext): Promise<void> {
  const schedule = await fhirClient.read('Schedule', scheduleId);
  if (schedule['active'] !== false) {
    await updateAudited(fhirClient, { ...schedule, id: scheduleId, active: false }, audit);
  }
}

/**
 * API §5.2.4. Busy slots are booked appointments (BR-001) and always protect the
 * schedule; free slots only with `cascade`: they are removed first, because HAPI
 * refuses to delete a Schedule that a Slot still references. A schedule that still
 * has slots afterwards (retired ones, kept for the appointment history) is
 * deactivated instead of deleted: the answer is the same 204 and a repeat is safe.
 * The schedule's own change (`delete`, or `update` for the deactivation) is audited with it (ADR-014);
 * the slots are a by-product of the schedule and are not journalled one by one.
 */
export async function removeScheduleWithSlots(fhirClient: FhirClient, scheduleId: string, cascade: boolean, audit: AuditContext): Promise<void> {
  // An unknown schedule is a 404 here, before anything is removed; the delete's AuditEvent needs a stored resource.
  await fhirClient.read('Schedule', scheduleId);
  if (await hasSlots(fhirClient, scheduleId, 'busy')) {
    throw scheduleInUse(scheduleId, 'has busy slots (booked appointments)');
  }
  if (!cascade && (await hasSlots(fhirClient, scheduleId))) {
    throw scheduleInUse(scheduleId, 'has slots; delete it with { "cascade": true } to remove the free ones');
  }
  await removeFreeSlots(fhirClient, scheduleId);
  if (await hasSlots(fhirClient, scheduleId)) {
    await deactivateSchedule(fhirClient, scheduleId, audit);
    return;
  }
  await deleteAudited(fhirClient, 'Schedule', scheduleId, audit);
}
