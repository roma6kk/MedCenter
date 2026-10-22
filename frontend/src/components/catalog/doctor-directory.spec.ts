import type { Doctor } from './catalog-types';
import { DIRECTORY_PAGE_SIZE, buildDirectory, directoryHref, doctorQueryOf, optionQueryOf, parseDirectoryParams, parseFhirId, specialtiesOf } from './doctor-directory';

function doctor(id: string, specialty?: string, specialtyCode?: string): Doctor {
  return { id, firstName: 'Имя', lastName: id, name: `Имя ${id}`, ...(specialty === undefined ? {} : { specialty }), ...(specialtyCode === undefined ? {} : { specialtyCode }) };
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
    expect(parseDirectoryParams({ serviceId: 'abc-1', specialty: '419192003', search: ' Иван ', page: '2' })).toEqual({
      serviceId: 'abc-1',
      specialty: '419192003',
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

  it.each(['Терапевт', 'a|b', '1 2', 'x'.repeat(65)])('should drop the specialty %p, as it is no code the API filters by', (specialty) => {
    expect(parseDirectoryParams({ specialty }).specialty).toBeUndefined();
  });

  it('should treat filters as unset when they are blank', () => {
    expect(parseDirectoryParams({ search: '   ', specialty: '' })).toEqual({ page: 1 });
  });
});

describe('specialtiesOf', () => {
  it('should offer each coded specialty once, sorted by label, and skip doctors without a code', () => {
    const doctors = [doctor('a', 'Хирург', '394609007'), doctor('b', 'Терапевт', '419192003'), doctor('c'), doctor('d', 'Хирург', '394609007'), doctor('e', 'Без кода')];

    expect(specialtiesOf(doctors)).toEqual([
      { code: '419192003', label: 'Терапевт' },
      { code: '394609007', label: 'Хирург' },
    ]);
  });

  it('should fall back to the code as the label when the specialty has no display text', () => {
    expect(specialtiesOf([doctor('a', undefined, '123')])).toEqual([{ code: '123', label: '123' }]);
  });
});

describe('doctorQueryOf', () => {
  it('should ask the API for every filter and one directory page when filters are set', () => {
    expect(doctorQueryOf({ serviceId: 's-1', specialty: '419192003', search: 'Ив', page: 2 })).toEqual({
      serviceId: 's-1',
      specialty: '419192003',
      search: 'Ив',
      page: 2,
      pageSize: DIRECTORY_PAGE_SIZE,
    });
  });

  it('should send only the page when no filter is set', () => {
    expect(doctorQueryOf({ page: 1 })).toEqual({ page: 1, pageSize: DIRECTORY_PAGE_SIZE });
  });
});

describe('optionQueryOf', () => {
  it('should keep the service and name but not the specialty or page, so every specialty stays on offer', () => {
    expect(optionQueryOf({ serviceId: 's-1', specialty: '419192003', search: 'Ив', page: 3 })).toEqual({ serviceId: 's-1', search: 'Ив' });
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
    expect(directoryHref({ specialty: '419192003', page: 2 })).toBe('/doctors?specialty=419192003&page=2');
  });
});

describe('buildDirectory', () => {
  it('should keep the API page as it is and offer the specialties of the option doctors', () => {
    const page = { items: [doctor('a', 'Терапевт', '419192003')], meta: { page: 1, pageSize: 9, totalItems: 1, totalPages: 1 } };

    const directory = buildDirectory(page, [doctor('a', 'Терапевт', '419192003'), doctor('b', 'Кардиолог', '394579002')]);

    expect(directory.page).toBe(page);
    expect(directory.specialties.map((option) => option.label)).toEqual(['Кардиолог', 'Терапевт']);
  });
});
