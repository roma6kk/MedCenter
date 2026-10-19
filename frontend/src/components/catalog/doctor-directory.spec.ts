import type { Doctor } from './catalog-types';
import { DIRECTORY_PAGE_SIZE, buildDirectory, directoryHref, filterBySpecialty, paginateList, parseDirectoryParams, parseFhirId, specialtiesOf } from './doctor-directory';

function doctor(id: string, specialty?: string): Doctor {
  return { id, firstName: 'Имя', lastName: id, name: `Имя ${id}`, ...(specialty === undefined ? {} : { specialty }) };
}

describe('parseFhirId', () => {
  it('should accept the value when it is a FHIR id', () => {
    expect(parseFhirId('2caba605-00fb-5acd-947f-10124066670a')).toBe('2caba605-00fb-5acd-947f-10124066670a');
  });

  it.each([undefined, '', '  ', 'a b', 'a,b', '../etc', 'x'.repeat(65), '.', '..', '...'])('should drop %p', (raw) => {
    expect(parseFhirId(raw)).toBeUndefined();
  });

  it('should keep a dot inside the id when other characters surround it', () => {
    expect(parseFhirId('a.b')).toBe('a.b');
    expect(parseFhirId('.hidden-1')).toBe('.hidden-1');
  });

  it('should take the first value when a FHIR id parameter is repeated', () => {
    expect(parseFhirId(['abc', 'def'])).toBe('abc');
  });
});

describe('parseDirectoryParams', () => {
  it.each(['.', '..'])('should ignore the service filter when serviceId is %p, as the API would refuse it', (serviceId) => {
    expect(parseDirectoryParams({ serviceId })).toEqual({ page: 1 });
  });

  it('should read the filters and the page when the query string carries them', () => {
    expect(parseDirectoryParams({ serviceId: 'abc-1', specialty: 'Терапевт', search: ' Иван ', page: '2' })).toEqual({
      serviceId: 'abc-1',
      specialty: 'Терапевт',
      search: 'Иван',
      page: 2,
    });
  });

  it('should fall back to page 1 when the page is missing, zero, negative or non-numeric', () => {
    expect(parseDirectoryParams({}).page).toBe(1);
    expect(parseDirectoryParams({ page: '0' }).page).toBe(1);
    expect(parseDirectoryParams({ page: '-4' }).page).toBe(1);
    expect(parseDirectoryParams({ page: 'abc' }).page).toBe(1);
  });

  it('should drop the serviceId when it is not a FHIR id, so the API never answers 400 to a typed URL', () => {
    expect(parseDirectoryParams({ serviceId: 'a b,c' }).serviceId).toBeUndefined();
  });

  it('should take the first value when a filter parameter is repeated', () => {
    expect(parseDirectoryParams({ search: ['Иван', 'Пётр'] }).search).toBe('Иван');
  });

  it('should cut the search term to the length the API accepts when it is longer', () => {
    expect(parseDirectoryParams({ search: 'я'.repeat(150) }).search).toHaveLength(100);
  });

  it('should treat filters as unset when they are blank', () => {
    expect(parseDirectoryParams({ search: '   ', specialty: '' })).toEqual({ page: 1 });
  });
});

describe('specialtiesOf', () => {
  it('should list each specialty once, sorted, when doctors share them or have none', () => {
    const doctors = [doctor('a', 'Хирург'), doctor('b', 'Терапевт'), doctor('c'), doctor('d', 'Хирург')];

    expect(specialtiesOf(doctors)).toEqual(['Терапевт', 'Хирург']);
  });
});

describe('filterBySpecialty', () => {
  const doctors = [doctor('a', 'Хирург'), doctor('b', 'Терапевт'), doctor('c')];

  it('should keep every doctor when no specialty is chosen', () => {
    expect(filterBySpecialty(doctors, undefined)).toHaveLength(3);
  });

  it('should keep only the doctors of the chosen specialty when one is chosen', () => {
    expect(filterBySpecialty(doctors, 'Терапевт').map((d) => d.id)).toEqual(['b']);
  });
});

describe('paginateList', () => {
  const items = Array.from({ length: 20 }, (_, index) => index);

  it('should cut a page and report the envelope meta when the list is paginated', () => {
    const page = paginateList(items, 2, 9);

    expect(page.items).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(page.meta).toEqual({ page: 2, pageSize: 9, totalItems: 20, totalPages: 3 });
  });

  it('should clamp the page to the last page when it is past the end', () => {
    expect(paginateList(items, 99, 9).meta.page).toBe(3);
  });

  it('should return an empty first page when the list is empty', () => {
    expect(paginateList([], 1, 9)).toEqual({ items: [], meta: { page: 1, pageSize: 9, totalItems: 0, totalPages: 0 } });
  });

  it('should use the directory page size when no size is given', () => {
    expect(paginateList(items, 1).meta.pageSize).toBe(DIRECTORY_PAGE_SIZE);
  });
});

describe('directoryHref', () => {
  it('should be the bare catalog path when no filter is set', () => {
    expect(directoryHref({ page: 1 })).toBe('/doctors');
  });

  it('should carry the filters and omit page 1 when filters are set on the first page', () => {
    expect(directoryHref({ serviceId: 's-1', search: 'Иван', page: 1 })).toBe('/doctors?serviceId=s-1&search=%D0%98%D0%B2%D0%B0%D0%BD');
  });

  it('should carry the page when it is 2 or later', () => {
    expect(directoryHref({ specialty: 'Терапевт', page: 2 })).toBe('/doctors?specialty=%D0%A2%D0%B5%D1%80%D0%B0%D0%BF%D0%B5%D0%B2%D1%82&page=2');
  });
});

describe('buildDirectory', () => {
  const doctors = [doctor('a', 'Терапевт'), doctor('b', 'Кардиолог'), doctor('c', 'Терапевт'), doctor('d')];

  it('should show every doctor and offer the known specialties when no specialty is chosen', () => {
    const directory = buildDirectory(doctors, { page: 1 });

    expect(directory.page.items).toHaveLength(4);
    expect(directory.specialties).toEqual(['Кардиолог', 'Терапевт']);
  });

  it('should narrow the list to the chosen specialty and keep the other options when one is chosen', () => {
    const directory = buildDirectory(doctors, { page: 1, specialty: 'Терапевт' });

    expect(directory.page.items.map((item) => item.id)).toEqual(['a', 'c']);
    expect(directory.specialties).toEqual(['Кардиолог', 'Терапевт']);
  });

  it('should keep a chosen specialty in the options even when no loaded doctor has it', () => {
    const directory = buildDirectory(doctors, { page: 1, specialty: 'Хирург' });

    expect(directory.page.items).toEqual([]);
    expect(directory.specialties).toContain('Хирург');
  });

  it('should cut the list into pages when the directory is built', () => {
    const many = Array.from({ length: DIRECTORY_PAGE_SIZE + 2 }, (_, index) => doctor(`d${index}`));

    expect(buildDirectory(many, { page: 2 }).page.items).toHaveLength(2);
  });
});
