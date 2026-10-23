import { ConflictException, Logger } from '@nestjs/common';
import { buildOutboxBasic, FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';
import type { DomainEvent, EventPublisher } from '@medcenter/messaging';
import { OUTBOX } from '@medcenter/terminology';

import type { LockStore } from './redis-lock';
import type { RelayConfig } from './relay.config';
import { RelayService } from './relay.service';

const NOW = new Date('2026-10-23T12:00:00.000Z');
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const CONFIG: RelayConfig = {
  pollIntervalMs: 1000,
  batchSize: 2,
  lockTtlMs: 30_000,
  retentionMs: 7 * DAY,
  stalePendingMs: 5 * MIN,
  housekeepingIntervalMs: 60_000,
};

/** In-memory HAPI slice: Basic records, tag/_lastUpdated search, If-Match transactions, `$expunge` log. */
class FakeHapi {
  readonly rows = new Map<string, FhirResource>();
  readonly expunged: string[] = [];
  readonly batches: FhirResource[] = [];
  failBatchWith?: Error;

  seed(id: string, status: 'pending' | 'sent', ageMs: number, event: Record<string, unknown> = { v: 1, type: 'appointment.booked.v1', eventId: `ev-${id}` }): void {
    const basic = buildOutboxBasic(event as { type: string; eventId: string });
    this.rows.set(id, {
      ...basic,
      id,
      meta: { versionId: '1', lastUpdated: new Date(NOW.getTime() - ageMs).toISOString(), tag: [{ system: OUTBOX.STATUS_SYSTEM, code: status }] },
    });
  }

  statusOf(id: string): string | undefined {
    const tags = (this.rows.get(id)?.['meta'] as { tag: Array<{ code: string }> } | undefined)?.tag;
    return tags?.[0]?.code;
  }

  client(): jest.Mocked<FhirClient> {
    return {
      search: jest.fn((_type: string, params: Record<string, unknown> = {}) => {
        const wanted = String(params['_tag']).split('|')[1];
        const before = params['_lastUpdated'] === undefined ? Infinity : Date.parse(String(params['_lastUpdated']).slice(2));
        const hits = [...this.rows.values()]
          .filter((row) => this.statusOf(row.id as string) === wanted)
          .filter((row) => Date.parse((row['meta'] as { lastUpdated: string }).lastUpdated) < before)
          .sort((a, b) => Date.parse((a['meta'] as { lastUpdated: string }).lastUpdated) - Date.parse((b['meta'] as { lastUpdated: string }).lastUpdated));
        return Promise.resolve({ total: hits.length, entry: hits.slice(0, Number(params['_count'])).map((resource) => ({ resource })) });
      }),
      batch: jest.fn((bundle: FhirResource) => {
        if (this.failBatchWith !== undefined) {
          return Promise.reject(this.failBatchWith);
        }
        this.batches.push(bundle);
        const entries = bundle['entry'] as Array<{ resource?: FhirResource; request: { method: string; url: string; ifMatch?: string } }>;
        for (const { request } of entries) {
          const id = request.url.split('/')[1] as string;
          const current = this.rows.get(id);
          if (request.ifMatch !== undefined && `W/"${(current?.['meta'] as { versionId: string }).versionId}"` !== request.ifMatch) {
            return Promise.reject(new FhirClientError('POST', 'http://hapi/fhir', 412));
          }
        }
        for (const { request, resource } of entries) {
          const id = request.url.split('/')[1] as string;
          if (request.method === 'DELETE') {
            this.rows.delete(id);
          } else if (resource !== undefined) {
            const version = Number((this.rows.get(id)?.['meta'] as { versionId: string }).versionId) + 1;
            this.rows.set(id, { ...resource, meta: { ...(resource['meta'] as object), versionId: String(version), lastUpdated: NOW.toISOString() } });
          }
        }
        return Promise.resolve({ resourceType: 'Bundle' });
      }),
      operation: jest.fn((_type: string, _op: string, _params?: Record<string, unknown>, options?: { id?: string }) => {
        this.expunged.push(options?.id ?? '');
        return Promise.resolve({ resourceType: 'Parameters' });
      }),
    } as unknown as jest.Mocked<FhirClient>;
  }
}

describe('RelayService', () => {
  let hapi: FakeHapi;
  let fhir: jest.Mocked<FhirClient>;
  let published: DomainEvent[];
  let publisher: EventPublisher;
  let lock: jest.Mocked<LockStore>;
  let warn: jest.SpyInstance;
  let service: RelayService;

  beforeEach(() => {
    hapi = new FakeHapi();
    fhir = hapi.client();
    published = [];
    publisher = { publish: jest.fn((event: DomainEvent) => { published.push(event); return Promise.resolve(); }) };
    lock = { acquire: jest.fn().mockResolvedValue(true), release: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined) };
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    service = new RelayService(fhir, publisher, lock, CONFIG);
  });

  afterEach(() => jest.restoreAllMocks());

  it('should publish a pending event with its eventId and mark it sent when a poll finds one', async () => {
    hapi.seed('b1', 'pending', MIN, { v: 1, type: 'appointment.booked.v1', eventId: 'ev-1', appointmentId: 'a-1' });

    await service.tick(NOW);

    expect(published).toEqual([{ v: 1, type: 'appointment.booked.v1', eventId: 'ev-1', appointmentId: 'a-1' }]);
    expect(hapi.statusOf('b1')).toBe('sent');
  });

  it('should send the status update as one transaction with If-Match on the read versions', async () => {
    hapi.seed('b1', 'pending', 2 * MIN);
    hapi.seed('b2', 'pending', MIN);

    await service.tick(NOW);

    const bundle = hapi.batches[0] as unknown as { entry: Array<{ request: { method: string; url: string; ifMatch: string } }> };
    expect(bundle.entry.map((entry) => entry.request)).toEqual([
      { method: 'PUT', url: 'Basic/b1', ifMatch: 'W/"1"' },
      { method: 'PUT', url: 'Basic/b2', ifMatch: 'W/"1"' },
    ]);
  });

  it('should keep reading batches until no pending record is left when more than one batch is waiting', async () => {
    for (const id of ['b1', 'b2', 'b3']) {
      hapi.seed(id, 'pending', 10 * MIN);
    }

    await service.tick(NOW);

    expect(published).toHaveLength(3);
    expect(['b1', 'b2', 'b3'].map((id) => hapi.statusOf(id))).toEqual(['sent', 'sent', 'sent']);
  });

  it('should leave a record pending and stop the batch when the broker rejects its event', async () => {
    hapi.seed('b1', 'pending', 3 * MIN);
    hapi.seed('b2', 'pending', 2 * MIN);
    (publisher.publish as jest.Mock).mockImplementationOnce(() => Promise.resolve()).mockRejectedValueOnce(new Error('broker down'));

    await service.tick(NOW);

    expect(hapi.statusOf('b1')).toBe('sent');
    expect(hapi.statusOf('b2')).toBe('pending');
  });

  it('should skip a record with an unreadable payload and still publish the ones behind it', async () => {
    hapi.seed('b1', 'pending', 3 * MIN);
    const bad = hapi.rows.get('b1') as unknown as { extension: Array<{ valueString?: string }> };
    bad.extension[2] = { ...bad.extension[2], valueString: '{not json' };
    hapi.seed('b2', 'pending', 2 * MIN);

    await service.tick(NOW);

    expect(hapi.statusOf('b1')).toBe('pending');
    expect(hapi.statusOf('b2')).toBe('sent');
  });

  it('should not poll when another replica holds the lock', async () => {
    lock.acquire.mockResolvedValue(false);

    await service.tick(NOW);

    expect(fhir.search).not.toHaveBeenCalled();
    expect(lock.release).not.toHaveBeenCalled();
  });

  it('should skip the poll without failing when the lock store is down', async () => {
    lock.acquire.mockRejectedValue(new Error('redis down'));

    await expect(service.tick(NOW)).resolves.toBeUndefined();

    expect(fhir.search).not.toHaveBeenCalled();
  });

  it('should release the lock with the token it acquired even when the poll fails', async () => {
    fhir.search.mockRejectedValue(new Error('hapi down'));

    await service.tick(NOW);

    const token = lock.acquire.mock.calls[0]?.[1];
    expect(lock.release).toHaveBeenCalledWith('outbox-relay:lock', token);
  });

  it('should treat a lost If-Match race as a duplicate and not fail when another relay marked the records first', async () => {
    hapi.seed('b1', 'pending', MIN);
    hapi.failBatchWith = new ConflictException();

    await expect(service.tick(NOW)).resolves.toBeUndefined();

    expect(hapi.statusOf('b1')).toBe('pending');
  });

  it('should delete and expunge sent records older than seven days and never touch pending ones', async () => {
    hapi.seed('old', 'sent', 8 * DAY);
    hapi.seed('recent', 'sent', DAY);
    hapi.seed('ancient-pending', 'pending', 30 * DAY);
    publisher.publish = jest.fn().mockRejectedValue(new Error('broker down'));

    await service.tick(NOW);

    expect(hapi.rows.has('old')).toBe(false);
    expect(hapi.expunged).toEqual(['old']);
    expect(hapi.rows.has('recent')).toBe(true);
    expect(hapi.rows.has('ancient-pending')).toBe(true);
  });

  it('should warn without the payload when a pending record is older than five minutes', async () => {
    hapi.seed('stuck', 'pending', 10 * MIN, { v: 1, type: 'appointment.booked.v1', eventId: 'ev-stuck', secret: 'PAYLOAD-MARKER' });
    publisher.publish = jest.fn().mockRejectedValue(new Error('broker down'));

    await service.tick(NOW);

    const staleCall = warn.mock.calls.find(([, message]) => String(message).includes('pending for too long'));
    expect(staleCall).toBeDefined();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('PAYLOAD-MARKER');
  });

  it('should not warn about stuck records when every pending record is fresh', async () => {
    hapi.seed('fresh', 'pending', MIN);
    publisher.publish = jest.fn().mockRejectedValue(new Error('broker down'));

    await service.tick(NOW);

    expect(warn.mock.calls.some(([, message]) => String(message).includes('pending for too long'))).toBe(false);
  });
});
