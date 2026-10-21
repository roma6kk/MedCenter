import { ConflictException } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { RoomsService } from './rooms.service';

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
      create: jest.fn().mockImplementation(async (_type: string, resource: FhirResource) => ({ ...resource, id: 'room-new' })),
      update: jest.fn().mockImplementation(async (_type: string, id: string, resource: FhirResource) => ({ ...resource, id })),
      delete: jest.fn(),
      batch: jest.fn(),
    } as unknown as jest.Mocked<FhirClient>;
    service = new RoomsService(fhir);
  });

  describe('create', () => {
    it('should answer 409 CONFLICT naming the identifier and write nothing when a room already uses it', async () => {
      const payload = await errorPayloadOf(service.create({ identifier: '204-Х', name: 'Кабинет 204 bis' }));

      expect(payload).toMatchObject({ errorCode: 'CONFLICT', message: expect.stringContaining('204-Х') });
      expect(fhir.create).not.toHaveBeenCalled();
    });

    it('should treat a differently cased or padded identifier as the same one', async () => {
      await errorPayloadOf(service.create({ identifier: '  204-х ', name: 'Кабинет' }));

      expect(fhir.create).not.toHaveBeenCalled();
    });

    it('should create the room when no room uses the identifier', async () => {
      const created = await service.create({ identifier: '305', name: 'Кабинет 305' });

      expect(created).toMatchObject({ id: 'room-new', identifier: '305' });
      expect(fhir.create).toHaveBeenCalledTimes(1);
    });

    it('should ignore a Location that is not a room when the identifier is checked', async () => {
      fhir.search.mockResolvedValue({
        entry: [{ resource: { resourceType: 'Location', id: 'building-1', identifier: [{ value: '305' }], physicalType: { coding: [{ code: 'bu' }] } } }],
      });

      await expect(service.create({ identifier: '305', name: 'Кабинет 305' })).resolves.toMatchObject({ id: 'room-new' });
    });
  });

  describe('update', () => {
    it('should answer 409 CONFLICT and write nothing when the room is renamed to the identifier of another room', async () => {
      const payload = await errorPayloadOf(service.update('room-204', { identifier: '101' }));

      expect(payload).toMatchObject({ errorCode: 'CONFLICT', message: expect.stringContaining('101') });
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it('should accept the identifier the room already has when the PATCH repeats it', async () => {
      await expect(service.update('room-204', { identifier: '204-Х', name: 'Renamed' })).resolves.toMatchObject({ id: 'room-204' });
      expect(fhir.update).toHaveBeenCalledTimes(1);
    });

    it('should rename the room when the new identifier is free', async () => {
      await expect(service.update('room-204', { identifier: '204-А' })).resolves.toMatchObject({ id: 'room-204', identifier: '204-А' });
    });

    it('should not scan the rooms when the PATCH leaves the identifier alone', async () => {
      await service.update('room-204', { name: 'Renamed' });

      expect(fhir.search).not.toHaveBeenCalled();
    });

    it('should answer 404 before checking the identifier when the room does not exist', async () => {
      fhir.read.mockRejectedValue(Object.assign(new Error('missing'), { name: 'FhirClientError' }));

      await expect(service.update('ghost', { identifier: '101' })).rejects.toThrow('missing');
      expect(fhir.search).not.toHaveBeenCalled();
    });
  });
});
