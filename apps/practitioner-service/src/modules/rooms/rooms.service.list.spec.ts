import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { RoomsService } from './rooms.service';

const PHYSICAL_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/location-physical-type';

function location(id: string, physicalCode: string | undefined, system = PHYSICAL_TYPE_SYSTEM): FhirResource {
  return {
    resourceType: 'Location',
    id,
    name: `Cabinet ${id}`,
    ...(physicalCode === undefined ? {} : { physicalType: { coding: [{ system, code: physicalCode }] } }),
  };
}

function bundleOf(locations: readonly FhirResource[]): { entry: { resource: FhirResource }[] } {
  return { entry: locations.map((resource) => ({ resource })) };
}

function rooms(prefix: string, count: number): FhirResource[] {
  return Array.from({ length: count }, (_, index) => location(`${prefix}${index + 1}`, 'ro'));
}

describe('RoomsService.list', () => {
  let roomsService: RoomsService;
  let fhirClient: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhirClient = {
      search: jest.fn(),
      read: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      batch: jest.fn(),
    } as unknown as jest.Mocked<FhirClient>;
    roomsService = new RoomsService(fhirClient);
  });

  it('should search Location without the physical-type parameter when rooms are listed', async () => {
    fhirClient.search.mockResolvedValue(bundleOf([location('r1', 'ro')]));

    await roomsService.list();

    expect(fhirClient.search).toHaveBeenCalledTimes(1);
    expect(fhirClient.search).toHaveBeenCalledWith('Location', { _count: 100, _offset: 0 });
  });

  it('should return only Locations whose physicalType is room when other kinds are stored', async () => {
    fhirClient.search.mockResolvedValue(
      bundleOf([
        location('wing', 'wi'),
        location('r1', 'ro'),
        location('untyped', undefined),
        location('foreign', 'ro', 'http://example.org/other-system'),
        location('r2', 'ro'),
      ]),
    );

    const result = await roomsService.list();

    expect(result.items.map((room) => room.id)).toEqual(['r1', 'r2']);
  });

  it('should page over the rooms and not over all Locations when a building sits between rooms', async () => {
    fhirClient.search.mockResolvedValue(
      bundleOf([location('r1', 'ro'), location('building', 'bu'), location('r2', 'ro'), location('r3', 'ro')]),
    );

    const secondPage = await roomsService.list(2, 2);

    expect(secondPage.items.map((room) => room.id)).toEqual(['r3']);
  });

  it('should count only rooms in the envelope total when other Locations are stored', async () => {
    fhirClient.search.mockResolvedValue(
      bundleOf([location('r1', 'ro'), location('building', 'bu'), location('r2', 'ro'), location('r3', 'ro')]),
    );

    const { meta } = await roomsService.list(1, 2);

    expect(meta).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
  });

  it('should return an empty envelope when no Location is a room', async () => {
    fhirClient.search.mockResolvedValue(bundleOf([location('building', 'bu')]));

    const result = await roomsService.list();

    expect(result).toEqual({ items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });

  it('should read the next chunk when the first one is full so the total counts every room', async () => {
    const buildings = Array.from({ length: 100 }, (_, index) => location(`b${index}`, 'bu'));
    fhirClient.search.mockResolvedValueOnce(bundleOf(buildings)).mockResolvedValueOnce(bundleOf(rooms('r', 3)));

    const result = await roomsService.list(1, 20);

    expect(fhirClient.search.mock.calls.map(([, params]) => params)).toEqual([
      { _count: 100, _offset: 0 },
      { _count: 100, _offset: 100 },
    ]);
    expect(result.items.map((room) => room.id)).toEqual(['r1', 'r2', 'r3']);
    expect(result.meta.totalItems).toBe(3);
  });

  it('should stop reading chunks when HAPI answers a short chunk', async () => {
    fhirClient.search.mockResolvedValue(bundleOf(rooms('r', 5)));

    const result = await roomsService.list(2, 20);

    expect(fhirClient.search).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([]);
    expect(result.meta).toMatchObject({ page: 2, totalItems: 5, totalPages: 1 });
  });

  it('should give up after the scan limit when every chunk is full', async () => {
    const buildings = Array.from({ length: 100 }, (_, index) => location(`b${index}`, 'bu'));
    fhirClient.search.mockResolvedValue(bundleOf(buildings));

    const result = await roomsService.list(1, 20);

    expect(fhirClient.search).toHaveBeenCalledTimes(10);
    expect(result.items).toEqual([]);
  });

  it('should map a room to the response shape when it is listed', async () => {
    fhirClient.search.mockResolvedValue(
      bundleOf([{ ...location('r1', 'ro'), identifier: [{ value: '204' }], status: 'inactive' }]),
    );

    const { items: [room] } = await roomsService.list();

    expect(room).toMatchObject({ id: 'r1', identifier: '204', name: 'Cabinet r1', isActive: false });
  });
});
