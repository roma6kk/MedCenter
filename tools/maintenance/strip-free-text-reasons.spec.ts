import { APPOINTMENT_CANCEL_REASON_SYSTEM } from '@medcenter/contracts';

import { FhirHttp, type FetchLike, type FhirResource } from '../shared/fhir-http';
import { stripFreeTextReasons, stripReasonsOf } from './strip-free-text-reasons';

const BASE = 'http://fhir.test/fhir';

interface Call {
  readonly method: string;
  readonly url: URL;
  readonly body: Record<string, unknown> | undefined;
}

interface BundleEntry {
  readonly resource: Record<string, unknown>;
  readonly request: { readonly method: string; readonly url: string; readonly ifMatch?: string };
}

function fakeHapi(appointments: unknown[], batchStatus = '200 OK', refuseExpunge: readonly string[] = []): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (raw, init) => {
    const url = new URL(raw);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    calls.push({ method: init?.method ?? 'GET', url, body });
    if (url.pathname.endsWith('/$expunge')) {
      const refused = refuseExpunge.some((id) => url.pathname.endsWith(`/${id}/$expunge`));
      return new Response(JSON.stringify({ resourceType: refused ? 'OperationOutcome' : 'Parameters' }), { status: refused ? 500 : 200 });
    }
    if (init?.method === 'POST') {
      const entries = (body?.['entry'] ?? []) as unknown[];
      return new Response(JSON.stringify({ resourceType: 'Bundle', type: 'batch-response', entry: entries.map(() => ({ response: { status: batchStatus } })) }), { status: 200 });
    }
    return new Response(JSON.stringify({ resourceType: 'Bundle', entry: appointments.map((resource) => ({ resource })) }), { status: 200 });
  };
  return { fetchImpl, calls };
}

const appointment = (id: string, extra: Record<string, unknown> = {}): FhirResource => ({
  resourceType: 'Appointment',
  id,
  status: 'booked',
  meta: { versionId: '4' },
  ...extra,
});

const coded = { coding: [{ system: APPOINTMENT_CANCEL_REASON_SYSTEM, code: 'plans-changed' }] };
const other = { coding: [{ system: APPOINTMENT_CANCEL_REASON_SYSTEM, code: 'other' }] };

const expungedIds = (calls: readonly Call[]): string[] =>
  calls.filter((call) => call.url.pathname.endsWith('/$expunge')).map((call) => call.url.pathname.split('/').slice(-2)[0] ?? '');

function writtenEntries(calls: readonly Call[]): BundleEntry[] {
  return calls.filter((call) => call.method === 'POST').flatMap((call) => (call.body?.['entry'] ?? []) as BundleEntry[]);
}

describe('stripReasonsOf', () => {
  it('should drop reasonCode and leave the rest of the appointment untouched', () => {
    const result = stripReasonsOf(appointment('a1', { reasonCode: [{ text: 'headache' }], comment: 'x' }));

    expect(result).toEqual(appointment('a1', { comment: 'x' }));
  });

  it('should replace a cancelationReason that has only free text with the code other', () => {
    const result = stripReasonsOf(appointment('a1', { status: 'cancelled', cancelationReason: { text: 'I am ill' } }));

    expect(result).toEqual(appointment('a1', { status: 'cancelled', cancelationReason: other }));
  });

  it('should replace a cancelationReason coded in a foreign system, dropping its text', () => {
    const result = stripReasonsOf(appointment('a1', { cancelationReason: { coding: [{ system: 'http://x', code: 'pat' }], text: 'ill' } }));

    expect(result?.['cancelationReason']).toEqual(other);
  });

  it('should drop the text and the foreign codings of a cancelationReason that also has the neutral coding', () => {
    const mixed = {
      coding: [
        { system: 'http://x', code: 'pat', display: 'ill' },
        { system: APPOINTMENT_CANCEL_REASON_SYSTEM, code: 'plans-changed' },
      ],
      text: 'I am ill',
    };

    const result = stripReasonsOf(appointment('a1', { cancelationReason: mixed }));

    expect(result?.['cancelationReason']).toEqual(coded);
  });

  it('should drop the text of a neutral-coded cancelationReason', () => {
    const result = stripReasonsOf(appointment('a1', { cancelationReason: { ...coded, text: 'I am ill' } }));

    expect(result?.['cancelationReason']).toEqual(coded);
  });

  it('should drop the display of a neutral coding together with the text', () => {
    const result = stripReasonsOf(
      appointment('a1', { cancelationReason: { coding: [{ system: APPOINTMENT_CANCEL_REASON_SYSTEM, code: 'other', display: 'free text' }] } }),
    );

    expect(result?.['cancelationReason']).toEqual(other);
  });

  it('should keep a cancelationReason that already carries a code of the neutral system', () => {
    expect(stripReasonsOf(appointment('a1', { cancelationReason: coded }))).toBeUndefined();
  });

  it('should return undefined when there is nothing to strip', () => {
    expect(stripReasonsOf(appointment('a1'))).toBeUndefined();
  });

  it('should treat an empty reasonCode array as nothing to strip beyond removing the key', () => {
    expect(stripReasonsOf(appointment('a1', { reasonCode: [] }))).toEqual(appointment('a1'));
  });
});

describe('stripFreeTextReasons', () => {
  it('should in a dry run count the candidates and write nothing', async () => {
    const { fetchImpl, calls } = fakeHapi([appointment('a1', { reasonCode: [{ text: 't' }] }), appointment('a2'), appointment('a3', { cancelationReason: { text: 't' } })]);

    const summary = await stripFreeTextReasons(new FhirHttp(BASE, fetchImpl), { apply: false });

    expect(summary).toEqual({ scanned: 3, withReasonCode: 1, withFreeTextCancelReason: 1, updated: 0, failed: 0, wouldExpunge: 2, expunged: 0, expungeFailed: 0 });
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
  });

  it('should with apply PUT each changed appointment in a batch under If-Match of the read version', async () => {
    const { fetchImpl, calls } = fakeHapi([appointment('a1', { reasonCode: [{ text: 't' }] }), appointment('a2'), appointment('a3', { cancelationReason: { text: 't' } })]);

    const summary = await stripFreeTextReasons(new FhirHttp(BASE, fetchImpl), { apply: true });

    const entries = writtenEntries(calls);
    expect(entries.map((entry) => entry.request)).toEqual([
      { method: 'PUT', url: 'Appointment/a1', ifMatch: 'W/"4"' },
      { method: 'PUT', url: 'Appointment/a3', ifMatch: 'W/"4"' },
    ]);
    expect(entries[0]?.resource['reasonCode']).toBeUndefined();
    expect(entries[1]?.resource['cancelationReason']).toEqual(other);
    expect(summary).toEqual({ scanned: 3, withReasonCode: 1, withFreeTextCancelReason: 1, updated: 2, failed: 0, wouldExpunge: 0, expunged: 2, expungeFailed: 0 });
  });

  it('should expunge the previous versions of every appointment it updated and only of those', async () => {
    const { fetchImpl, calls } = fakeHapi([appointment('a1', { reasonCode: [{ text: 't' }] }), appointment('a2'), appointment('a3', { cancelationReason: { text: 't' } })]);

    await stripFreeTextReasons(new FhirHttp(BASE, fetchImpl), { apply: true });

    expect(expungedIds(calls)).toEqual(['a1', 'a3']);
    const expungeCall = calls.find((call) => call.url.pathname.endsWith('/$expunge'));
    expect(expungeCall).toMatchObject({ method: 'POST', body: { parameter: [{ name: 'expungePreviousVersions', valueBoolean: true }] } });
  });

  it('should not expunge an appointment whose update was rejected', async () => {
    const { fetchImpl, calls } = fakeHapi([appointment('a1', { reasonCode: [{ text: 't' }] })], '412 Precondition Failed');

    await stripFreeTextReasons(new FhirHttp(BASE, fetchImpl), { apply: true });

    expect(expungedIds(calls)).toEqual([]);
  });

  it('should count a failed expunge separately and keep going', async () => {
    const { fetchImpl, calls } = fakeHapi([appointment('a1', { reasonCode: [{ text: 't' }] }), appointment('a2', { reasonCode: [{ text: 't' }] })], '200 OK', ['a1']);

    const summary = await stripFreeTextReasons(new FhirHttp(BASE, fetchImpl), { apply: true });

    expect(expungedIds(calls)).toEqual(['a1', 'a2']);
    expect(summary).toMatchObject({ updated: 2, failed: 0, expunged: 1, expungeFailed: 1 });
  });

  it('should in a dry run expunge nothing', async () => {
    const { fetchImpl, calls } = fakeHapi([appointment('a1', { reasonCode: [{ text: 't' }] })]);

    await stripFreeTextReasons(new FhirHttp(BASE, fetchImpl), { apply: false });

    expect(expungedIds(calls)).toEqual([]);
  });

  it('should with expungeHistory also clear the history of clean appointments that have older versions', async () => {
    const { fetchImpl, calls } = fakeHapi([appointment('a1'), appointment('a2', { meta: { versionId: '1' } }), appointment('a3', { cancelationReason: coded })]);

    const summary = await stripFreeTextReasons(new FhirHttp(BASE, fetchImpl), { apply: true, expungeHistory: true });

    expect(expungedIds(calls)).toEqual(['a1', 'a3']);
    expect(summary).toMatchObject({ updated: 0, expunged: 2 });
  });

  it('should be idempotent: clean appointments cause no write', async () => {
    const { fetchImpl, calls } = fakeHapi([appointment('a1'), appointment('a2', { cancelationReason: coded })]);

    const summary = await stripFreeTextReasons(new FhirHttp(BASE, fetchImpl), { apply: true });

    expect(writtenEntries(calls)).toEqual([]);
    expect(summary).toMatchObject({ scanned: 2, updated: 0, failed: 0 });
  });

  it('should count a rejected write (a concurrent update) as failed', async () => {
    const { fetchImpl } = fakeHapi([appointment('a1', { reasonCode: [{ text: 't' }] })], '412 Precondition Failed');

    const summary = await stripFreeTextReasons(new FhirHttp(BASE, fetchImpl), { apply: true });

    expect(summary).toMatchObject({ updated: 0, failed: 1 });
  });

  it('should not leave patient data in the summary', async () => {
    const { fetchImpl } = fakeHapi([appointment('a1', { reasonCode: [{ text: 'secret diagnosis' }] })]);

    const summary = await stripFreeTextReasons(new FhirHttp(BASE, fetchImpl), { apply: false });

    expect(JSON.stringify(summary)).not.toContain('secret');
  });
});
