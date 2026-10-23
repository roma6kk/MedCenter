import { BadGatewayException, ConflictException, Logger } from '@nestjs/common';
import { ERROR_CODES } from '@medcenter/contracts';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { removeScheduleWithSlots } from './schedule-removal';

const SCHEDULE_ID = 'sched-1';
const AUDIT = { actor: { sub: 'admin-1', requestId: 'req-1' }, source: 'catalog-service' };
const slot = (id: string, status: string): FhirResource => ({ resourceType: 'Slot', id, status, meta: { versionId: '3' } });
const bundleOf = (...slots: FhirResource[]): { entry: Array<{ resource: FhirResource }> } => ({
  entry: slots.map((resource) => ({ resource })),
});
const answers = (...statuses: string[]): FhirResource =>
  ({ resourceType: 'Bundle', entry: statuses.map((status) => ({ response: { status } })) }) as unknown as FhirResource;

interface Entry {
  readonly request: { readonly method: string; readonly url: string; readonly ifMatch?: string };
  readonly resource?: FhirResource;
}

/**
 * A schedule holding `slots` as HAPI keeps them: searches answer by the `status`
 * filter, a batch DELETE removes a slot unless an Appointment `referenced` it (409),
 * a batch PUT stores the slot as sent.
 */
function scheduleWith(slots: FhirResource[], referenced: string[] = []): jest.Mocked<FhirClient> {
  let remaining = [...slots];
  return {
    search: jest.fn(async (_type: string, params?: Record<string, unknown>) =>
      bundleOf(
        ...remaining
          .filter((candidate) => params?.['status'] === undefined || candidate['status'] === params['status'])
          .slice(0, Number(params?.['_count'] ?? Number.MAX_SAFE_INTEGER)),
      ),
    ),
    batch: jest.fn(async (bundle: FhirResource) => {
      const entries = bundle['entry'] as Entry[];
      if (bundle['type'] === 'transaction') {
        // The schedule's own change and its AuditEvent (ADR-014).
        return answers(...entries.map(() => '200 OK'));
      }
      return answers(
        ...entries.map(({ request, resource }) => {
          const id = request.url.replace('Slot/', '');
          if (request.method === 'PUT' && resource !== undefined) {
            remaining = remaining.map((candidate) => (candidate.id === id ? resource : candidate));
            return '200 OK';
          }
          if (referenced.includes(id)) {
            return '409 Conflict';
          }
          remaining = remaining.filter((candidate) => candidate.id !== id);
          return '204 No Content';
        }),
      );
    }),
    read: jest.fn().mockResolvedValue({ resourceType: 'Schedule', id: SCHEDULE_ID, active: true }),
  } as unknown as jest.Mocked<FhirClient>;
}

/** The slot batches (`type: batch`) of the removal; the audited schedule write is a `transaction`. */
const slotBatches = (fhir: jest.Mocked<FhirClient>): unknown[][] => fhir.batch.mock.calls.filter((call) => (call[0] as unknown as { type: string }).type === 'batch');

/** The audited writes of the schedule itself, as `METHOD url` plus the AuditEvent's subtype. */
function transactionsOf(fhir: jest.Mocked<FhirClient>): string[] {
  return fhir.batch.mock.calls
    .map((call) => call[0] as unknown as { type: string; entry: Array<{ request: { method: string; url: string }; resource?: FhirResource }> })
    .filter((bundle) => bundle.type === 'transaction')
    .map((bundle) =>
      bundle.entry
        .map((entry) => `${entry.request.method} ${entry.request.url}${entry.resource?.resourceType === 'AuditEvent' ? ` (${JSON.stringify(entry.resource['subtype'])})` : ''}`)
        .join(' + '),
    );
}

const sentEntries = (fhir: jest.Mocked<FhirClient>, call: number): Entry[] =>
  (fhir.batch.mock.calls[call]?.[0] as unknown as { entry: Entry[] }).entry;

async function refusalOf(promise: Promise<unknown>): Promise<ConflictException> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ConflictException);
  return error as ConflictException;
}

describe('removeScheduleWithSlots', () => {
  it('should delete only the schedule when it has no slots', async () => {
    const fhir = scheduleWith([]);

    await removeScheduleWithSlots(fhir, SCHEDULE_ID, false, AUDIT);

    expect(slotBatches(fhir)).toHaveLength(0);
    expect(transactionsOf(fhir)).toEqual(['DELETE Schedule/sched-1 + POST AuditEvent ([{"system":"http://hl7.org/fhir/restful-interaction","code":"delete"}])']);
  });

  it('should refuse with the catalogued SCHEDULE_IN_USE code when a slot is busy, even with cascade', async () => {
    const fhir = scheduleWith([slot('a', 'free'), slot('b', 'busy')]);

    const refusal = await refusalOf(removeScheduleWithSlots(fhir, SCHEDULE_ID, true, AUDIT));

    const { errorCode } = refusal.getResponse() as { errorCode: string };
    expect(ERROR_CODES).toContain(errorCode);
    expect(errorCode).toBe('SCHEDULE_IN_USE');
    expect(fhir.batch).not.toHaveBeenCalled();
  });

  it('should refuse with SCHEDULE_IN_USE when free slots exist and cascade is off', async () => {
    const fhir = scheduleWith([slot('a', 'free')]);

    const refusal = await refusalOf(removeScheduleWithSlots(fhir, SCHEDULE_ID, false, AUDIT));

    expect(refusal.getResponse()).toMatchObject({ errorCode: 'SCHEDULE_IN_USE' });
    expect(fhir.batch).not.toHaveBeenCalled();
  });

  it('should delete the free slots first and the schedule after them when cascade is on', async () => {
    const fhir = scheduleWith([slot('a', 'free'), slot('b', 'free')]);

    await removeScheduleWithSlots(fhir, SCHEDULE_ID, true, AUDIT);

    const bundle = fhir.batch.mock.calls[0]?.[0] as unknown as { type: string; entry: Array<{ request: unknown }> };
    expect(bundle.type).toBe('batch');
    expect(bundle.entry.map((entry) => entry.request)).toEqual([
      { method: 'DELETE', url: 'Slot/a' },
      { method: 'DELETE', url: 'Slot/b' },
    ]);
    expect(fhir.batch.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'transaction' });
    expect(transactionsOf(fhir)).toEqual(['DELETE Schedule/sched-1 + POST AuditEvent ([{"system":"http://hl7.org/fhir/restful-interaction","code":"delete"}])']);
  });

  it('should keep deleting page after page until no free slot is left', async () => {
    const many = Array.from({ length: 450 }, (_, index) => slot(`s-${index}`, 'free'));
    const fhir = scheduleWith(many);

    await removeScheduleWithSlots(fhir, SCHEDULE_ID, true, AUDIT);

    const deletes = (slotBatches(fhir) as Array<[unknown]>).flatMap((call) => (call[0] as unknown as { entry: Entry[] }).entry);
    expect(deletes).toHaveLength(450);
    expect(slotBatches(fhir)).toHaveLength(3);
  });

  it('should fail with a gateway error and keep the schedule when HAPI refuses a slot delete for another reason', async () => {
    const fhir = scheduleWith([slot('a', 'free')]);
    fhir.batch.mockResolvedValue(answers('500 Internal Server Error'));

    await expect(removeScheduleWithSlots(fhir, SCHEDULE_ID, true, AUDIT)).rejects.toBeInstanceOf(BadGatewayException);
    expect(transactionsOf(fhir)).toEqual([]);
  });

  it('should fail with a gateway error when HAPI answers fewer entries than the batch had', async () => {
    const fhir = scheduleWith([slot('a', 'free'), slot('b', 'free')]);
    fhir.batch.mockResolvedValue(answers('204 No Content'));

    await expect(removeScheduleWithSlots(fhir, SCHEDULE_ID, true, AUDIT)).rejects.toBeInstanceOf(BadGatewayException);
    expect(transactionsOf(fhir)).toEqual([]);
  });
});

/** HAPI answers 409 for a slot a cancelled Appointment still names in `Appointment.slot` (verified on the live stack). */
describe('removeScheduleWithSlots with slots that cancelled appointments reference', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should retire the referenced slot and deactivate the schedule when HAPI answers 409 for its delete', async () => {
    const fhir = scheduleWith([slot('a', 'free'), slot('b', 'free')], ['b']);

    await expect(removeScheduleWithSlots(fhir, SCHEDULE_ID, true, AUDIT)).resolves.toBeUndefined();

    const [retire] = sentEntries(fhir, 1);
    expect(retire?.request).toMatchObject({ method: 'PUT', url: 'Slot/b' });
    expect(retire?.resource).toMatchObject({ id: 'b', status: 'entered-in-error' });
    expect(transactionsOf(fhir)).toEqual(['PUT Schedule/sched-1 + POST AuditEvent ([{"system":"http://hl7.org/fhir/restful-interaction","code":"update"}])']);
  });

  it('should still delete the other free slots of the page when one of them is referenced', async () => {
    const fhir = scheduleWith([slot('a', 'free'), slot('b', 'free'), slot('c', 'free')], ['b']);

    await removeScheduleWithSlots(fhir, SCHEDULE_ID, true, AUDIT);

    const attempted = sentEntries(fhir, 0).map((entry) => `${entry.request.method} ${entry.request.url}`);
    expect(attempted).toEqual(['DELETE Slot/a', 'DELETE Slot/b', 'DELETE Slot/c']);
    expect(slotBatches(fhir)).toHaveLength(2);
  });

  it('should write the retirement under an If-Match on the slot version it read when a slot is referenced', async () => {
    const fhir = scheduleWith([slot('b', 'free')], ['b']);

    await removeScheduleWithSlots(fhir, SCHEDULE_ID, true, AUDIT);

    expect(sentEntries(fhir, 1)[0]?.request.ifMatch).toBe('W/"3"');
  });

  it('should refuse with SCHEDULE_IN_USE and leave the schedule alone when the retirement loses a race with a booking', async () => {
    const fhir = scheduleWith([slot('b', 'free')], ['b']);
    fhir.batch.mockResolvedValueOnce(answers('409 Conflict')).mockResolvedValueOnce(answers('409 Conflict'));

    const refusal = await refusalOf(removeScheduleWithSlots(fhir, SCHEDULE_ID, true, AUDIT));

    expect(refusal.getResponse()).toMatchObject({ errorCode: 'SCHEDULE_IN_USE' });
    expect(transactionsOf(fhir)).toEqual([]);
  });

  it('should fail with a gateway error when the retirement write itself fails', async () => {
    const fhir = scheduleWith([slot('b', 'free')], ['b']);
    fhir.batch.mockResolvedValueOnce(answers('409 Conflict')).mockResolvedValueOnce(answers('500 Internal Server Error'));

    await expect(removeScheduleWithSlots(fhir, SCHEDULE_ID, true, AUDIT)).rejects.toBeInstanceOf(BadGatewayException);
    expect(transactionsOf(fhir)).toEqual([]);
  });

  it('should deactivate an already retired schedule without writing again when it is removed a second time', async () => {
    const fhir = scheduleWith([slot('b', 'entered-in-error')]);
    fhir.read.mockResolvedValue({ resourceType: 'Schedule', id: SCHEDULE_ID, active: false });

    await expect(removeScheduleWithSlots(fhir, SCHEDULE_ID, true, AUDIT)).resolves.toBeUndefined();

    expect(fhir.batch).not.toHaveBeenCalled();
  });

  it('should deactivate a schedule that holds only retired slots when it is removed again after a failed first run', async () => {
    const fhir = scheduleWith([slot('a', 'entered-in-error')]);

    await removeScheduleWithSlots(fhir, SCHEDULE_ID, true, AUDIT);

    expect(transactionsOf(fhir)).toEqual(['PUT Schedule/sched-1 + POST AuditEvent ([{"system":"http://hl7.org/fhir/restful-interaction","code":"update"}])']);
  });

  it('should refuse a schedule that holds only retired slots when cascade is off', async () => {
    const fhir = scheduleWith([slot('a', 'entered-in-error')]);

    const refusal = await refusalOf(removeScheduleWithSlots(fhir, SCHEDULE_ID, false, AUDIT));

    expect(refusal.getResponse()).toMatchObject({ errorCode: 'SCHEDULE_IN_USE' });
    expect(transactionsOf(fhir)).toEqual([]);
  });
});
