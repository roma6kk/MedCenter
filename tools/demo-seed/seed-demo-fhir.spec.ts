import { FhirHttp, type FetchLike } from '../shared/fhir-http';
import { InMemoryFhirServer } from '../shared/in-memory-fhir';
import { SCHEDULES } from './demo-catalog';
import { DEMO_TAG_SEARCH, demoIds } from './demo-ids';
import { addDays, horizonOf, plannedSlots, seedDemoFhir, writeResources, type DemoSeedOptions } from './seed-demo-fhir';

const BASE = 'http://fhir.test/fhir';
/** A Monday: the 14-day window then holds every weekday exactly twice. */
const OPTIONS: DemoSeedOptions = { fromDay: '2026-11-02', days: 14, now: new Date('2026-11-01T00:00:00.000Z') };
/** Every weekday occurs twice in 14 days: 80 + 90 (Ivanova), 36 + 36 (Petrov), 90 (Sidorova), 72 (Kozlov). */
const EXPECTED_SLOTS = 404;
const TYPES = ['Organization', 'Location', 'Practitioner', 'PractitionerRole', 'HealthcareService', 'Schedule', 'Slot'] as const;

function counts(server: InMemoryFhirServer): Record<string, number> {
  return Object.fromEntries(TYPES.map((type) => [type, server.count(type)]));
}

function versions(server: InMemoryFhirServer): Record<string, number | undefined> {
  return Object.fromEntries(
    TYPES.flatMap((type) => server.all(type).map((resource) => [`${type}/${resource.id}`, server.versionOf(type, resource.id ?? '')])),
  );
}

interface BundleRequest {
  readonly entries: ReadonlyArray<{ readonly request?: { readonly url?: string } }>;
}

/** Records the entry URLs of every transaction Bundle, in request order. */
function recordBundles(server: InMemoryFhirServer): { fetchImpl: FetchLike; bundles: string[][] } {
  const bundles: string[][] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    if ((init?.method ?? 'GET') === 'POST' && typeof init?.body === 'string') {
      const body = JSON.parse(init.body) as { entry?: BundleRequest['entries'] };
      bundles.push((body.entry ?? []).map((entry) => entry.request?.url ?? ''));
    }
    return server.fetch(url, init);
  };
  return { fetchImpl, bundles };
}

describe('addDays / horizonOf', () => {
  it('should add calendar days to a YYYY-MM-DD date', () => {
    expect(addDays('2026-11-02', 13)).toBe('2026-11-15');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('should end the horizon on the last of the requested days', () => {
    expect(horizonOf(OPTIONS)).toEqual({ from: '2026-11-02', to: '2026-11-15' });
  });
});

describe('seedDemoFhir', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('should create the clinic, rooms, doctors, services, schedules and every planned slot on an empty server', async () => {
    const server = new InMemoryFhirServer();

    const summary = await seedDemoFhir(new FhirHttp(BASE, server.fetch), OPTIONS);

    expect(counts(server)).toEqual({
      Organization: 1,
      Location: 5,
      Practitioner: 4,
      PractitionerRole: 4,
      HealthcareService: 6,
      Schedule: 6,
      Slot: EXPECTED_SLOTS,
    });
    expect(summary.seededCounts).toEqual(counts(server));
  });

  it('should leave counts and versions unchanged and create no slot on a second run', async () => {
    const server = new InMemoryFhirServer();
    const http = new FhirHttp(BASE, server.fetch);
    await seedDemoFhir(http, OPTIONS);
    const before = { counts: counts(server), versions: versions(server) };

    const second = await seedDemoFhir(http, OPTIONS);

    expect(counts(server)).toEqual(before.counts);
    expect(versions(server)).toEqual(before.versions);
    expect(second.slots.every((slots) => slots.created === 0)).toBe(true);
    expect(Object.values(second.writes).every((stats) => stats.created === 0)).toBe(true);
  });

  it('should never use POST for a resource: ids are client-assigned so a re-run cannot duplicate', async () => {
    const server = new InMemoryFhirServer();

    await seedDemoFhir(new FhirHttp(BASE, server.fetch), OPTIONS);

    const writes = server.requests.filter((request) => request.method !== 'GET');
    expect(writes.every((request) => request.method === 'POST' && request.url === BASE)).toBe(true);
  });

  it('should not free a slot that was booked between two runs', async () => {
    const server = new InMemoryFhirServer();
    const http = new FhirHttp(BASE, server.fetch);
    await seedDemoFhir(http, OPTIONS);
    const [slot] = server.all('Slot');
    server.preload({ ...slot, status: 'busy' });

    await seedDemoFhir(http, OPTIONS);

    expect(server.all('Slot').find((candidate) => candidate.id === slot.id)?.['status']).toBe('busy');
    expect(server.versionOf('Slot', slot.id ?? '')).toBe(1);
  });

  it('should write the clinic before what references it and schedules last, slots after schedules', async () => {
    const server = new InMemoryFhirServer();
    const { fetchImpl, bundles } = recordBundles(server);

    await seedDemoFhir(new FhirHttp(BASE, fetchImpl), OPTIONS);

    const order = bundles.map((entries) => (entries[0] ?? '').split('/')[0]);
    expect(order.slice(0, 6)).toEqual(['Organization', 'Location', 'Practitioner', 'HealthcareService', 'PractitionerRole', 'Schedule']);
    expect(new Set(order.slice(6))).toEqual(new Set(['Slot']));
  });

  it('should skip slots that already started at the time of the run', async () => {
    const server = new InMemoryFhirServer();
    const afterFirstMorning = { ...OPTIONS, now: new Date('2026-11-02T08:00:00.000Z') };

    await seedDemoFhir(new FhirHttp(BASE, server.fetch), afterFirstMorning);

    const started = server.all('Slot').filter((slot) => Date.parse(String(slot['start'])) <= afterFirstMorning.now.getTime());
    expect(started).toEqual([]);
    expect(server.count('Slot')).toBeLessThan(EXPECTED_SLOTS);
  });

  it('should report the seeded resources by the demo tag', async () => {
    const server = new InMemoryFhirServer();
    const { fetchImpl } = recordBundles(server);

    await seedDemoFhir(new FhirHttp(BASE, fetchImpl), OPTIONS);

    expect(server.requests.some((request) => decodeURIComponent(request.url).includes(`_tag=${DEMO_TAG_SEARCH}`))).toBe(true);
  });
});

describe('plannedSlots', () => {
  it('should plan the slots of one schedule over the horizon', () => {
    const slots = plannedSlots('ivanova-primary', horizonOf(OPTIONS), OPTIONS.now);

    expect(slots).toHaveLength(80);
    expect(slots.every((slot) => (slot['schedule'] as { reference: string }).reference === `Schedule/${demoIds.schedule('ivanova-primary')}`)).toBe(true);
  });

  it('should plan nothing for a schedule key that is not in the catalog', () => {
    expect(() => plannedSlots('nobody', horizonOf(OPTIONS), OPTIONS.now)).toThrow(/Unknown schedule key/);
  });

  it('should plan the same slots for every schedule that the manifest lists', () => {
    const total = SCHEDULES.map((schedule) => plannedSlots(schedule.key, horizonOf(OPTIONS), OPTIONS.now).length).reduce((a, b) => a + b, 0);

    expect(total).toBe(EXPECTED_SLOTS);
  });
});

describe('writeResources', () => {
  const slot = (id: string): { resourceType: string; id: string } => ({ resourceType: 'Slot', id });

  it('should split the writes into transactions of at most 100 entries', async () => {
    const server = new InMemoryFhirServer();
    const { fetchImpl, bundles } = recordBundles(server);

    const stats = await writeResources(
      new FhirHttp(BASE, fetchImpl),
      Array.from({ length: 250 }, (_, index) => slot(`s${index}`)),
    );

    expect(bundles.map((entries) => entries.length)).toEqual([100, 100, 50]);
    expect(stats).toEqual({ created: 250, updated: 0 });
  });

  it('should count an existing resource as updated rather than created', async () => {
    const server = new InMemoryFhirServer();
    const http = new FhirHttp(BASE, server.fetch);
    await writeResources(http, [slot('a')]);

    expect(await writeResources(http, [slot('a'), slot('b')])).toEqual({ created: 1, updated: 1 });
  });

  it('should fail when the transaction answers fewer entries than were sent', async () => {
    const short: FetchLike = async () => new Response(JSON.stringify({ resourceType: 'Bundle', type: 'transaction-response', entry: [] }));

    await expect(writeResources(new FhirHttp(BASE, short), [slot('a')])).rejects.toThrow(/answered 0 entries for 1 requests/);
  });

  it('should fail on an entry status that is neither created nor updated', async () => {
    const refused: FetchLike = async () =>
      new Response(JSON.stringify({ resourceType: 'Bundle', entry: [{ response: { status: '412 Precondition Failed' } }] }));

    await expect(writeResources(new FhirHttp(BASE, refused), [slot('a')])).rejects.toThrow(/Unexpected transaction entry status/);
  });
});
