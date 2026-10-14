import { Logger } from '@nestjs/common';
import type { FhirClient, FhirSearchResult } from '@medcenter/fhir';

import { orReferences, searchAllPages, searchPages } from './fhir-search';

function page(count: number, offset: number): FhirSearchResult {
  return {
    entry: Array.from({ length: count }, (_, i) => ({
      resource: { resourceType: 'Slot', id: `slot-${offset + i}` },
    })),
  };
}

function createFhirClientMock(): jest.Mocked<FhirClient> {
  return { search: jest.fn() } as unknown as jest.Mocked<FhirClient>;
}

describe('searchAllPages', () => {
  it('should follow _offset pages until a short page arrives', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();
    fhirClient.search.mockResolvedValueOnce(page(2, 0)).mockResolvedValueOnce(page(1, 2));

    // Act
    const resources = await searchAllPages(fhirClient, 'Slot', { status: 'free' }, { pageSize: 2 });

    // Assert
    expect(resources.map((resource) => resource.id)).toEqual(['slot-0', 'slot-1', 'slot-2']);
    expect(fhirClient.search).toHaveBeenNthCalledWith(1, 'Slot', { status: 'free', _count: 2, _offset: 0 });
    expect(fhirClient.search).toHaveBeenNthCalledWith(2, 'Slot', { status: 'free', _count: 2, _offset: 2 });
  });

  it('should stop at the page cap when every page is full', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();
    fhirClient.search.mockImplementation(async (_type, params) =>
      page(2, Number((params ?? {})['_offset'])),
    );

    // Act
    const resources = await searchAllPages(fhirClient, 'Slot', {}, { pageSize: 2, maxPages: 3 });

    // Assert
    expect(resources).toHaveLength(6);
    expect(fhirClient.search).toHaveBeenCalledTimes(3);
  });

  it('should return an empty list when the first page is empty', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();
    fhirClient.search.mockResolvedValue({});

    // Act
    const resources = await searchAllPages(fhirClient, 'Slot', {});

    // Assert
    expect(resources).toEqual([]);
    expect(fhirClient.search).toHaveBeenCalledTimes(1);
  });
});

describe('searchPages', () => {
  it('should report the list as complete when a short page ends the search', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();
    fhirClient.search.mockResolvedValueOnce(page(2, 0)).mockResolvedValueOnce(page(1, 2));

    // Act
    const result = await searchPages(fhirClient, 'Slot', {}, { pageSize: 2 });

    // Assert
    expect(result.truncated).toBe(false);
    expect(result.resources).toHaveLength(3);
  });

  it('should report the list as truncated when every page up to the cap is full', async () => {
    // Arrange
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const fhirClient = createFhirClientMock();
    fhirClient.search.mockImplementation(async (_type, params) => page(2, Number((params ?? {})['_offset'])));

    // Act
    const result = await searchPages(fhirClient, 'Slot', {}, { pageSize: 2, maxPages: 3 });

    // Assert — the caller learns the cap ended the search, not the data.
    expect(result.truncated).toBe(true);
    expect(result.resources).toHaveLength(6);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('orReferences', () => {
  it('should join typed references with commas when several ids are given', () => {
    expect(orReferences('Schedule', ['a', 'b'])).toBe('Schedule/a,Schedule/b');
  });
});
