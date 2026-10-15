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

/** `count` rooms with ids `<prefix>1..<prefix>count`. */
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
    // Arrange
    fhirClient.search.mockResolvedValue(bundleOf([location('r1', 'ro')]));

    // Act
    await roomsService.list();

    // Assert — R4 has no `Location?physical-type` (HAPI answers 400 HAPI-0524).
    expect(fhirClient.search).toHaveBeenCalledTimes(1);
    expect(fhirClient.search).toHaveBeenCalledWith('Location', { _count: 100, _offset: 0 });
  });

  it('should return only Locations whose physicalType is room when other kinds are stored', async () => {
    // Arrange
    fhirClient.search.mockResolvedValue(
      bundleOf([
        location('wing', 'wi'),
        location('r1', 'ro'),
        location('untyped', undefined),
        location('foreign', 'ro', 'http://example.org/other-system'),
        location('r2', 'ro'),
      ]),
    );

    // Act
    const result = await roomsService.list();

    // Assert
    expect(result.items.map((room) => room.id)).toEqual(['r1', 'r2']);
  });

  it('should page over the rooms and not over all Locations when a building sits between rooms', async () => {
    // Arrange
    fhirClient.search.mockResolvedValue(
      bundleOf([location('r1', 'ro'), location('building', 'bu'), location('r2', 'ro'), location('r3', 'ro')]),
    );

    // Act
    const secondPage = await roomsService.list(2, 2);

    // Assert
    expect(secondPage.items.map((room) => room.id)).toEqual(['r3']);
  });

  it('should count only rooms in the envelope total when other Locations are stored', async () => {
    // Arrange
    fhirClient.search.mockResolvedValue(
      bundleOf([location('r1', 'ro'), location('building', 'bu'), location('r2', 'ro'), location('r3', 'ro')]),
    );

    // Act
    const { meta } = await roomsService.list(1, 2);

    // Assert
    expect(meta).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
  });

  it('should return an empty envelope when no Location is a room', async () => {
    // Arrange
    fhirClient.search.mockResolvedValue(bundleOf([location('building', 'bu')]));

    // Act
    const result = await roomsService.list();

    // Assert
    expect(result).toEqual({ items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });

  it('should read the next chunk when the first one is full so the total counts every room', async () => {
    // Arrange — a full first chunk means HAPI may have more to give.
    const buildings = Array.from({ length: 100 }, (_, index) => location(`b${index}`, 'bu'));
    fhirClient.search.mockResolvedValueOnce(bundleOf(buildings)).mockResolvedValueOnce(bundleOf(rooms('r', 3)));

    // Act
    const result = await roomsService.list(1, 20);

    // Assert
    expect(fhirClient.search.mock.calls.map(([, params]) => params)).toEqual([
      { _count: 100, _offset: 0 },
      { _count: 100, _offset: 100 },
    ]);
    expect(result.items.map((room) => room.id)).toEqual(['r1', 'r2', 'r3']);
    expect(result.meta.totalItems).toBe(3);
  });

  it('should stop reading chunks when HAPI answers a short chunk', async () => {
    // Arrange
    fhirClient.search.mockResolvedValue(bundleOf(rooms('r', 5)));

    // Act
    const result = await roomsService.list(2, 20);

    // Assert — the page is past the last room: nothing to return, nothing more to read.
    expect(fhirClient.search).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([]);
    expect(result.meta).toMatchObject({ page: 2, totalItems: 5, totalPages: 1 });
  });

  it('should give up after the scan limit when every chunk is full', async () => {
    // Arrange
    const buildings = Array.from({ length: 100 }, (_, index) => location(`b${index}`, 'bu'));
    fhirClient.search.mockResolvedValue(bundleOf(buildings));

    // Act
    const result = await roomsService.list(1, 20);

    // Assert — a bounded scan: an unbounded loop over a large store would hold the request open.
    expect(fhirClient.search).toHaveBeenCalledTimes(10);
    expect(result.items).toEqual([]);
  });

  it('should map a room to the response shape when it is listed', async () => {
    // Arrange
    fhirClient.search.mockResolvedValue(
      bundleOf([{ ...location('r1', 'ro'), identifier: [{ value: '204' }], status: 'inactive' }]),
    );

    // Act
    const { items: [room] } = await roomsService.list();

    // Assert
    expect(room).toMatchObject({ id: 'r1', identifier: '204', name: 'Cabinet r1', isActive: false });
  });
});
