import { ConflictException } from '@nestjs/common';
import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { auditedResource, committedAudit, committedEntries, committedWrites, transactionResponder } from '../../common/__tests__/audited-transactions';
import { roomIdentifierQuery } from './room-identifier';
import { RoomsService } from './rooms.service';

const ACTOR = { sub: 'admin-1', requestId: 'req-1' };

const ROOM_TYPE = { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'ro' }] };

function room(id: string, identifier: string): FhirResource {
  return { resourceType: 'Location', id, name: `Cabinet ${identifier}`, identifier: [{ value: identifier }], physicalType: ROOM_TYPE };
}

async function errorPayloadOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);
    return (error as ConflictException).getResponse();
  }
  throw new Error('expected the promise to reject');
}

describe('RoomsService identifier uniqueness (API §4.4, §4.5)', () => {
  let service: RoomsService;
  let fhir: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhir = {
      search: jest.fn().mockResolvedValue({ entry: [{ resource: room('room-204', '204-Х') }, { resource: room('room-101', '101') }] }),
      read: jest.fn().mockImplementation(async (_type: string, id: string) => room(id, id === 'room-101' ? '101' : '204-Х')),
      batch: jest.fn().mockImplementation(transactionResponder()),
    } as unknown as jest.Mocked<FhirClient>;
    service = new RoomsService(fhir);
  });

  describe('create', () => {
    it('should answer 409 CONFLICT naming the identifier and write nothing when a room already uses it', async () => {
      const payload = await errorPayloadOf(service.create({ identifier: '204-Х', name: 'Кабинет 204 bis' }, ACTOR));

      expect(payload).toMatchObject({ errorCode: 'CONFLICT', message: expect.stringContaining('204-Х') });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should treat a differently cased or padded identifier as the same one', async () => {
      await errorPayloadOf(service.create({ identifier: '  204-х ', name: 'Кабинет' }, ACTOR));

      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should create the room when no room uses the identifier', async () => {
      const created = await service.create({ identifier: '305', name: 'Кабинет 305' }, ACTOR);

      expect(created).toMatchObject({ id: expect.any(String), identifier: '305' });
      expect(fhir.batch).toHaveBeenCalledTimes(1);
    });

    it('should ignore a Location that is not a room when the identifier is checked', async () => {
      fhir.search.mockResolvedValue({
        entry: [{ resource: { resourceType: 'Location', id: 'building-1', identifier: [{ value: '305' }], physicalType: { coding: [{ code: 'bu' }] } } }],
      });

      await expect(service.create({ identifier: '305', name: 'Кабинет 305' }, ACTOR)).resolves.toMatchObject({ id: expect.any(String), identifier: '305' });
    });
  });

  describe('update', () => {
    it('should answer 409 CONFLICT and write nothing when the room is renamed to the identifier of another room', async () => {
      const payload = await errorPayloadOf(service.update('room-204', { identifier: '101' }, ACTOR));

      expect(payload).toMatchObject({ errorCode: 'CONFLICT', message: expect.stringContaining('101') });
      expect(fhir.batch).not.toHaveBeenCalled();
    });

    it('should accept the identifier the room already has when the PATCH repeats it', async () => {
      await expect(service.update('room-204', { identifier: '204-Х', name: 'Renamed' }, ACTOR)).resolves.toMatchObject({ id: 'room-204' });
      expect(fhir.batch).toHaveBeenCalledTimes(1);
    });

    it('should rename the room when the new identifier is free', async () => {
      await expect(service.update('room-204', { identifier: '204-А' }, ACTOR)).resolves.toMatchObject({ id: 'room-204', identifier: '204-А' });
    });

    it('should not scan the rooms when the PATCH leaves the identifier alone', async () => {
      await service.update('room-204', { name: 'Renamed' }, ACTOR);

      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should answer 404 before checking the identifier when the room does not exist', async () => {
      fhir.read.mockRejectedValue(Object.assign(new Error('missing'), { name: 'FhirClientError' }));

      await expect(service.update('ghost', { identifier: '101' }, ACTOR)).rejects.toThrow('missing');
      expect(fhir.search).not.toHaveBeenCalled();
    });
  });

  describe('creation is atomic (concurrent creates of one identifier)', () => {
    it('should store the room and its AuditEvent in one transaction, the room as a conditional create on its identifier', async () => {
      const created = await service.create({ identifier: '305', name: 'Кабинет 305' }, ACTOR);

      expect(fhir.batch).toHaveBeenCalledTimes(1);
      expect(committedWrites(fhir)).toEqual(['PUT Location?identifier=305', 'POST AuditEvent']);
      expect(committedEntries(fhir)[0]?.resource).toMatchObject({ id: created.id, identifier: [{ value: '305' }] });
    });

    it('should answer 409 CONFLICT naming the identifier when HAPI refused the transaction because a room was created in between', async () => {
      // HAPI-2279: the conditional create matched a stored room under another id (400); the read check now sees it.
      let reads = 0;
      fhir.search.mockImplementation(async () => ({ entry: reads++ === 0 ? [] : [{ resource: room('room-winner', '305') }] }));
      fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir', 400, 'HAPI-2279'));

      const payload = await errorPayloadOf(service.create({ identifier: '305', name: 'Кабинет 305' }, ACTOR));

      expect(payload).toMatchObject({
        errorCode: 'CONFLICT',
        message: 'CONFLICT: room identifier "305" is already used by room room-winner',
      });
    });

    it('should answer 409 CONFLICT when HAPI met a conflicting write in flight, even before the winner is visible', async () => {
      fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir', 412, '{}'));

      const payload = await errorPayloadOf(service.create({ identifier: '305', name: 'Кабинет 305' }, ACTOR));

      expect(payload).toMatchObject({ errorCode: 'CONFLICT' });
    });

    it('should not mistake another HAPI failure for a taken identifier', async () => {
      fhir.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir', 503, 'down'));

      await expect(service.create({ identifier: '305', name: 'Кабинет 305' }, ACTOR)).rejects.toBeInstanceOf(FhirClientError);
    });

    it('should let exactly one of two concurrent creates win when the store applies the conditional create', async () => {
      const stored = new Set<string>();
      fhir.batch.mockImplementation(async (bundle) => {
        const [first] = bundle['entry'] as Array<{ request: { url: string } }>;
        if (stored.has(first?.request.url ?? '')) {
          throw new FhirClientError('POST', 'http://hapi/fhir', 400, 'HAPI-2279');
        }
        stored.add(first?.request.url ?? '');
        return { resourceType: 'Bundle', type: 'transaction-response', entry: [] };
      });

      const outcomes = await Promise.allSettled([
        service.create({ identifier: '305', name: 'A' }, ACTOR),
        service.create({ identifier: '305', name: 'B' }, ACTOR),
      ]);

      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
    });

    it('should escape the characters FHIR reserves in a token and URL-encode the rest', () => {
      expect(roomIdentifierQuery('2,0|4$х\\')).toBe(`Location?identifier=${encodeURIComponent('2\\,0\\|4\\$х\\\\')}`);
      expect(roomIdentifierQuery('204-Х')).toBe(`Location?identifier=${encodeURIComponent('204-Х')}`);
    });
  });

  describe('audit (FR-021, ADR-014)', () => {
    it('should write the create AuditEvent of the room in the same transaction, with the actor and the request id', async () => {
      const created = await service.create({ identifier: '305', name: 'Кабинет 305' }, ACTOR);

      expect(committedAudit(fhir)).toMatchObject({
        action: 'C',
        subtype: [{ code: 'create' }],
        agent: [{ who: { identifier: { value: 'admin-1' } }, requestor: true }],
        source: { observer: { display: 'practitioner-service' } },
        entity: [auditedResource('Location', created.id), { what: { identifier: { value: 'req-1' } } }],
      });
    });

    it('should write the update AuditEvent of the room in the same transaction as the change', async () => {
      await service.update('room-204', { name: 'Renamed' }, ACTOR);

      expect(committedWrites(fhir)).toEqual(['PUT Location/room-204', 'POST AuditEvent']);
      expect(committedAudit(fhir)).toMatchObject({ action: 'U', entity: [auditedResource('Location', 'room-204'), expect.anything()] });
    });
  });
});
