import { ConflictException } from '@nestjs/common';
import { ERROR_CODES } from '@medcenter/contracts';
import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import { auditedResource, committedAudit, committedEntries, transactionResponder } from '../../common/__tests__/audited-transactions';
import { RoomsService } from './rooms.service';

const ACTOR = { sub: 'admin-1', requestId: 'req-1' };

const FLOOR = MEDCENTER_EXT.ROOM_FLOOR;

describe('RoomsService', () => {
  let roomsService: RoomsService;
  let fhirClient: jest.Mocked<FhirClient>;
  const roomId = 'room-204';

  beforeEach(() => {
    fhirClient = {
      search: jest.fn(),
      read: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      batch: jest.fn().mockImplementation(transactionResponder()),
    } as unknown as jest.Mocked<FhirClient>;
    roomsService = new RoomsService(fhirClient);
  });

  it('should refuse to delete a room referenced by an active schedule', async () => {
    fhirClient.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'Schedule' } }] });

    await expect(roomsService.remove(roomId, ACTOR)).rejects.toThrow('ROOM_IN_USE');
  });

  it('should mark the conflict with the ROOM_IN_USE error code', async () => {
    fhirClient.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'Schedule' } }] });

    const error = await roomsService.remove(roomId, ACTOR).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ errorCode: 'ROOM_IN_USE' });
  });

  it('should throw an error code the contract catalogues when the room is in use', async () => {
    fhirClient.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'Schedule' } }] });

    const error = await roomsService.remove(roomId, ACTOR).then(
      () => undefined,
      (e: unknown) => e as ConflictException,
    );

    // ProblemDetailsFilter only promotes catalogued codes; an unknown one degrades to CONFLICT.
    const { errorCode } = error?.getResponse() as { errorCode: string };
    expect(ERROR_CODES).toContain(errorCode);
  });

  it('should delete a Location when no schedule references it', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });
    fhirClient.read.mockResolvedValue({ resourceType: 'Location', id: roomId });

    await expect(roomsService.remove(roomId, ACTOR)).resolves.toBeUndefined();
    expect(committedEntries(fhirClient).map((entry) => `${entry.request.method} ${entry.request.url}`)).toEqual([`DELETE Location/${roomId}`, 'POST AuditEvent']);
    expect(committedAudit(fhirClient)).toMatchObject({ action: 'D', subtype: [{ code: 'delete' }], entity: [auditedResource('Location', roomId), expect.anything()] });
  });

  it('should never delete a Location when a schedule references it', async () => {
    fhirClient.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'Schedule' } }] });

    await expect(roomsService.remove(roomId, ACTOR)).rejects.toThrow('ROOM_IN_USE');
    expect(fhirClient.batch).not.toHaveBeenCalled();
  });

  it('should answer 404 for an unknown room before checking schedules', async () => {
    fhirClient.read.mockRejectedValue(
      new FhirClientError('GET', 'http://hapi/Location/missing', 404, '{}'),
    );

    const error = await roomsService.remove('missing', ACTOR).then(
      () => undefined,
      (e: unknown) => e as FhirClientError,
    );
    expect(error?.getStatus()).toBe(404);
    expect(fhirClient.search).not.toHaveBeenCalled();
    expect(fhirClient.batch).not.toHaveBeenCalled();
  });

  it('should look up referencing schedules through Schedule.actor when the delete is checked', async () => {
    // Arrange
    fhirClient.read.mockResolvedValue({ resourceType: 'Location', id: roomId });
    fhirClient.search.mockResolvedValue({ entry: [] });

    // Act
    await roomsService.remove(roomId, ACTOR);

    // Assert — R4 `Schedule` has no `location` search parameter (HAPI answers
    // 400 → 500 INTERNAL); the room is one of the schedule's actors.
    expect(fhirClient.search).toHaveBeenCalledWith('Schedule', {
      actor: `Location/${roomId}`,
      _count: 1,
    });
  });

  describe('update', () => {
    const existing = {
      resourceType: 'Location',
      id: roomId,
      name: 'Cabinet 204',
      description: 'Old description',
      identifier: [{ value: '204' }],
      physicalType: {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'ro' },
        ],
      },
    };

    it('does not blank stored fields omitted from the partial DTO', async () => {
      fhirClient.read.mockResolvedValue(existing);

      await roomsService.update(roomId, { name: 'Renamed 204' }, ACTOR);

      const merged = (committedEntries(fhirClient)[0]?.resource ?? {}) as FhirResource;
      expect(merged['name']).toBe('Renamed 204');
      expect(merged['description']).toBe('Old description');
      expect(merged['identifier']).toEqual([{ value: '204' }]);
    });

    it('replaces only the fields the PATCH carries', async () => {
      fhirClient.read.mockResolvedValue(existing);

      await roomsService.update(roomId, { description: 'Freshly painted' }, ACTOR);

      const merged = (committedEntries(fhirClient)[0]?.resource ?? {}) as FhirResource;
      expect(merged['description']).toBe('Freshly painted');
      expect(merged['name']).toBe('Cabinet 204');
    });
  });

  describe('floor round-trip', () => {
    it('persists floor as a valueInteger extension on create', async () => {
      fhirClient.search.mockResolvedValue({ entry: [] });

      await roomsService.create({ identifier: '204', name: 'Cabinet 204', floor: 2 }, ACTOR);

      const created = (committedEntries(fhirClient)[0]?.resource ?? {}) as FhirResource;
      expect(created['extension']).toEqual([{ url: FLOOR, valueInteger: 2 }]);
    });

    it('reads floor back from the extension into the response DTO', async () => {
      fhirClient.read.mockResolvedValue({
        resourceType: 'Location',
        id: roomId,
        name: 'Cabinet 204',
        extension: [{ url: FLOOR, valueInteger: 3 }],
      });

      const room = await roomsService.findById(roomId);

      expect(room.floor).toBe(3);
    });

    it('replaces the stored floor extension on a floor PATCH without blanking others', async () => {
      fhirClient.read.mockResolvedValue({
        resourceType: 'Location',
        id: roomId,
        name: 'Cabinet 204',
        description: 'Old description',
        extension: [
          { url: FLOOR, valueInteger: 2 },
          { url: 'https://example.org/StructureDefinition/other', valueString: 'keep-me' },
        ],
      });

      await roomsService.update(roomId, { floor: 5 }, ACTOR);

      const merged = (committedEntries(fhirClient)[0]?.resource ?? {}) as FhirResource;
      expect(merged['extension']).toEqual([
        { url: 'https://example.org/StructureDefinition/other', valueString: 'keep-me' },
        { url: FLOOR, valueInteger: 5 },
      ]);
      expect(merged['description']).toBe('Old description');
    });

    it('keeps the stored floor when the PATCH omits it', async () => {
      fhirClient.read.mockResolvedValue({
        resourceType: 'Location',
        id: roomId,
        name: 'Cabinet 204',
        extension: [{ url: FLOOR, valueInteger: 2 }],
      });

      await roomsService.update(roomId, { name: 'Renamed' }, ACTOR);

      const merged = (committedEntries(fhirClient)[0]?.resource ?? {}) as FhirResource;
      expect(merged['extension']).toEqual([{ url: FLOOR, valueInteger: 2 }]);
    });
  });
});
