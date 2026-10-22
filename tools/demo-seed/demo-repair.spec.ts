import { FhirHttp, type FetchLike } from '../shared/fhir-http';
import { repairDemoData } from './demo-repair';

const BASE = 'http://fhir.test/fhir';

interface Call {
  readonly method: string;
  readonly url: URL;
  readonly body: unknown;
}

function bundleOf(resources: readonly unknown[], total?: number): unknown {
  return { resourceType: 'Bundle', ...(total === undefined ? {} : { total }), entry: resources.map((resource) => ({ resource })) };
}

/** A HAPI stand-in answering by resource type; `batchStatuses` are the per-entry outcomes of the batch. */
function fakeHapi(data: { encounters: unknown[]; booked: unknown[]; locations?: unknown[]; services?: unknown[]; inactive?: number; batchStatuses?: string[] }): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (raw, init) => {
    const url = new URL(raw);
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method: init?.method ?? 'GET', url, body });
    const type = url.pathname.replace('/fhir', '').replace(/^\//, '');
    const json = (value: unknown): Response => new Response(JSON.stringify(value), { status: 200 });
    if (init?.method === 'POST') return json({ resourceType: 'Bundle', type: 'batch-response', entry: (data.batchStatuses ?? []).map((status) => ({ response: { status } })) });
    if (type === 'Encounter') return json(bundleOf(data.encounters));
    if (type === 'Appointment') return json(bundleOf(data.booked));
    if (type === 'Schedule') return json(bundleOf([], data.inactive ?? 0));
    if (type === 'Location') return json(bundleOf(data.locations ?? []));
    if (type === 'HealthcareService') return json(bundleOf(data.services ?? []));
    return new Response('{}', { status: 404 });
  };
  return { fetchImpl, calls };
}

const encounter = (id: string, appointmentId: string): unknown => ({ resourceType: 'Encounter', id, status: 'finished', appointment: [{ reference: `Appointment/${appointmentId}` }] });
const booked = (id: string, version: string): unknown => ({ resourceType: 'Appointment', id, status: 'booked', meta: { versionId: version } });

describe('repairDemoData', () => {
  it('should look up the booked appointments of finished encounters and PUT them fulfilled under If-Match in one batch', async () => {
    const { fetchImpl, calls } = fakeHapi({ encounters: [encounter('e1', 'a1'), encounter('e2', 'a2'), encounter('e3', 'a1')], booked: [booked('a1', '3')], batchStatuses: ['200 OK'] });

    const summary = await repairDemoData(new FhirHttp(BASE, fetchImpl));

    const lookup = calls.find((call) => call.url.pathname.endsWith('/Appointment'));
    expect(lookup?.url.searchParams.get('_id')).toBe('a1,a2');
    expect(lookup?.url.searchParams.get('status')).toBe('booked');
    const batch = calls.find((call) => call.method === 'POST')?.body as { type: string; entry: Array<{ resource: { status: string }; request: unknown }> };
    expect(batch.type).toBe('batch');
    expect(batch.entry).toHaveLength(1);
    expect(batch.entry[0]?.resource.status).toBe('fulfilled');
    expect(batch.entry[0]?.request).toEqual({ method: 'PUT', url: 'Appointment/a1', ifMatch: 'W/"3"' });
    expect(summary.fulfilled).toEqual(['a1']);
    expect(summary.failed).toEqual([]);
  });

  it('should write nothing when no booked appointment has a finished encounter', async () => {
    const { fetchImpl, calls } = fakeHapi({ encounters: [encounter('e1', 'a1')], booked: [] });

    const summary = await repairDemoData(new FhirHttp(BASE, fetchImpl));

    expect(calls.some((call) => call.method !== 'GET')).toBe(false);
    expect(summary.fulfilled).toEqual([]);
  });

  it('should report a row the batch refused instead of counting it as repaired', async () => {
    const { fetchImpl } = fakeHapi({ encounters: [encounter('e1', 'a1'), encounter('e2', 'a2')], booked: [booked('a1', '1'), booked('a2', '5')], batchStatuses: ['200 OK', '412 Precondition Failed'] });

    const summary = await repairDemoData(new FhirHttp(BASE, fetchImpl));

    expect(summary.fulfilled).toEqual(['a1']);
    expect(summary.failed).toEqual([{ id: 'a2', status: '412 Precondition Failed' }]);
  });

  it('should only report inactive schedules and rooms or services named like a check, never delete them', async () => {
    const { fetchImpl, calls } = fakeHapi({
      encounters: [],
      booked: [],
      inactive: 10,
      locations: [{ resourceType: 'Location', id: '1811', name: 'zz-repro' }, { resourceType: 'Location', id: 'r1', name: 'Кабинет 101' }],
      services: [{ resourceType: 'HealthcareService', id: 's9', name: 'E2E-check услуга' }],
    });

    const summary = await repairDemoData(new FhirHttp(BASE, fetchImpl));

    expect(summary.leftovers).toEqual({ inactiveSchedules: 10, checkResources: ['Location/1811 «zz-repro»', 'HealthcareService/s9 «E2E-check услуга»'] });
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });
});
