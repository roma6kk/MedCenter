import { BadGatewayException, ConflictException, Logger } from '@nestjs/common';
import { ERROR_CODES } from '@medcenter/contracts';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { removeScheduleWithSlots } from './schedule-removal';

const SCHEDULE_ID = 'sched-1';
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
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<FhirClient>;
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

    await removeScheduleWithSlots(fhir, SCHEDULE_ID, false);

    expect(fhir.batch).not.toHaveBeenCalled();
    expect(fhir.delete).toHaveBeenCalledWith('Schedule', SCHEDULE_ID);
  });

  it('should refuse with the catalogued SCHEDULE_IN_USE code when a slot is busy, even with cascade', async () => {
    const fhir = scheduleWith([slot('a', 'free'), slot('b', 'busy')]);

    const refusal = await refusalOf(removeScheduleWithSlots(fhir, SCHEDULE_ID, true));

    const { errorCode } = refusal.getResponse() as { errorCode: string };
    expect(ERROR_CODES).toContain(errorCode);
    expect(errorCode).toBe('SCHEDULE_IN_USE');
    expect(fhir.batch).not.toHaveBeenCalled();
    expect(fhir.delete).not.toHaveBeenCalled();
  });

  it('should refuse with SCHEDULE_IN_USE when free slots exist and cascade is off', async () => {
    const fhir = scheduleWith([slot('a', 'free')]);

    const refusal = await refusalOf(removeScheduleWithSlots(fhir, SCHEDULE_ID, false));

    expect(refusal.getResponse()).toMatchObject({ errorCode: 'SCHEDULE_IN_USE' });
    expect(fhir.batch).not.toHaveBeenCalled();
    expect(fhir.delete).not.toHaveBeenCalled();
  });

  it('should delete the free slots first and the schedule after them when cascade is on', async () => {
    const fhir = scheduleWith([slot('a', 'free'), slot('b', 'free')]);

    await removeScheduleWithSlots(fhir, SCHEDULE_ID, true);

    const bundle = fhir.batch.mock.calls[0]?.[0] as unknown as { type: string; entry: Array<{ request: unknown }> };
    expect(bundle.type).toBe('batch');
    expect(bundle.entry.map((entry) => entry.request)).toEqual([
      { method: 'DELETE', url: 'Slot/a' },
      { method: 'DELETE', url: 'Slot/b' },
    ]);
    expect(fhir.batch.mock.invocationCallOrder[0]).toBeLessThan(fhir.delete.mock.invocationCallOrder[0] ?? 0);
    expect(fhir.update).not.toHaveBeenCalled();
  });

  it('should keep deleting page after page until no free slot is left', async () => {
    const many = Array.from({ length: 450 }, (_, index) => slot(`s-${index}`, 'free'));
    const fhir = scheduleWith(many);

    await removeScheduleWithSlots(fhir, SCHEDULE_ID, true);

    const deletes = fhir.batch.mock.calls.flatMap((call) => (call[0] as unknown as { entry: Entry[] }).entry);
    expect(deletes).toHaveLength(450);
    expect(fhir.batch).toHaveBeenCalledTimes(3);
  });

  it('should fail with a gateway error and keep the schedule when HAPI refuses a slot delete for another reason', async () => {
    const fhir = scheduleWith([slot('a', 'free')]);
    fhir.batch.mockResolvedValue(answers('500 Internal Server Error'));

    await expect(removeScheduleWithSlots(fhir, SCHEDULE_ID, true)).rejects.toBeInstanceOf(BadGatewayException);
    expect(fhir.delete).not.toHaveBeenCalled();
    expect(fhir.update).not.toHaveBeenCalled();
  });

  it('should fail with a gateway error when HAPI answers fewer entries than the batch had', async () => {
    const fhir = scheduleWith([slot('a', 'free'), slot('b', 'free')]);
    fhir.batch.mockResolvedValue(answers('204 No Content'));

    await expect(removeScheduleWithSlots(fhir, SCHEDULE_ID, true)).rejects.toBeInstanceOf(BadGatewayException);
    expect(fhir.delete).not.toHaveBeenCalled();
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

    await expect(removeScheduleWithSlots(fhir, SCHEDULE_ID, true)).resolves.toBeUndefined();

    const [retire] = sentEntries(fhir, 1);
    expect(retire?.request).toMatchObject({ method: 'PUT', url: 'Slot/b' });
    expect(retire?.resource).toMatchObject({ id: 'b', status: 'entered-in-error' });
    expect(fhir.update).toHaveBeenCalledWith('Schedule', SCHEDULE_ID, expect.objectContaining({ active: false }));
    expect(fhir.delete).not.toHaveBeenCalled();
  });

  it('should still delete the other free slots of the page when one of them is referenced', async () => {
    const fhir = scheduleWith([slot('a', 'free'), slot('b', 'free'), slot('c', 'free')], ['b']);

    await removeScheduleWithSlots(fhir, SCHEDULE_ID, true);

    const attempted = sentEntries(fhir, 0).map((entry) => `${entry.request.method} ${entry.request.url}`);
    expect(attempted).toEqual(['DELETE Slot/a', 'DELETE Slot/b', 'DELETE Slot/c']);
    expect(fhir.batch).toHaveBeenCalledTimes(2);
  });

  it('should write the retirement under an If-Match on the slot version it read when a slot is referenced', async () => {
    const fhir = scheduleWith([slot('b', 'free')], ['b']);

    await removeScheduleWithSlots(fhir, SCHEDULE_ID, true);

    expect(sentEntries(fhir, 1)[0]?.request.ifMatch).toBe('W/"3"');
  });

  it('should refuse with SCHEDULE_IN_USE and leave the schedule alone when the retirement loses a race with a booking', async () => {
    const fhir = scheduleWith([slot('b', 'free')], ['b']);
    fhir.batch.mockResolvedValueOnce(answers('409 Conflict')).mockResolvedValueOnce(answers('409 Conflict'));

    const refusal = await refusalOf(removeScheduleWithSlots(fhir, SCHEDULE_ID, true));

    expect(refusal.getResponse()).toMatchObject({ errorCode: 'SCHEDULE_IN_USE' });
    expect(fhir.update).not.toHaveBeenCalled();
    expect(fhir.delete).not.toHaveBeenCalled();
  });

  it('should fail with a gateway error when the retirement write itself fails', async () => {
    const fhir = scheduleWith([slot('b', 'free')], ['b']);
    fhir.batch.mockResolvedValueOnce(answers('409 Conflict')).mockResolvedValueOnce(answers('500 Internal Server Error'));

    await expect(removeScheduleWithSlots(fhir, SCHEDULE_ID, true)).rejects.toBeInstanceOf(BadGatewayException);
    expect(fhir.update).not.toHaveBeenCalled();
  });

  it('should deactivate an already retired schedule without writing again when it is removed a second time', async () => {
    const fhir = scheduleWith([slot('b', 'entered-in-error')]);
    fhir.read.mockResolvedValue({ resourceType: 'Schedule', id: SCHEDULE_ID, active: false });

    await expect(removeScheduleWithSlots(fhir, SCHEDULE_ID, true)).resolves.toBeUndefined();

    expect(fhir.batch).not.toHaveBeenCalled();
    expect(fhir.update).not.toHaveBeenCalled();
    expect(fhir.delete).not.toHaveBeenCalled();
  });

  it('should deactivate a schedule that holds only retired slots when it is removed again after a failed first run', async () => {
    const fhir = scheduleWith([slot('a', 'entered-in-error')]);

    await removeScheduleWithSlots(fhir, SCHEDULE_ID, true);

    expect(fhir.update).toHaveBeenCalledWith('Schedule', SCHEDULE_ID, expect.objectContaining({ active: false }));
  });

  it('should refuse a schedule that holds only retired slots when cascade is off', async () => {
    const fhir = scheduleWith([slot('a', 'entered-in-error')]);

    const refusal = await refusalOf(removeScheduleWithSlots(fhir, SCHEDULE_ID, false));

    expect(refusal.getResponse()).toMatchObject({ errorCode: 'SCHEDULE_IN_USE' });
    expect(fhir.update).not.toHaveBeenCalled();
  });
});
