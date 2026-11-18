import type { CatalogService, Doctor } from '@/components/catalog/catalog-types';
import { groupServices, specialtyOfDoctors, type ServiceSpecialty } from './service-groups';

function service(id: string): CatalogService {
  return { id, name: id, typeSystem: 'sys', typeCode: id, defaultDurationMin: 30, isActive: true };
}

function doctor(patch: Partial<Doctor>): Doctor {
  return { id: 'd', firstName: 'А', lastName: 'Б', name: 'А Б', ...patch };
}

const THERAPY: ServiceSpecialty = { code: '1', label: 'Терапевт' };
const HEART: ServiceSpecialty = { code: '2', label: 'Кардиолог' };

describe('groupServices', () => {
  it('should put services of the same specialty together when the catalogue lists them apart', () => {
    const specialties: Readonly<Record<string, ServiceSpecialty>> = { a: THERAPY, b: HEART, c: THERAPY };

    const groups = groupServices([service('a'), service('b'), service('c')], (id) => specialties[id] ?? null);

    expect(groups.map((group) => [group.key, group.services.map((item) => item.id)])).toEqual([
      ['1', ['a', 'c']],
      ['2', ['b']],
    ]);
  });

  it('should close with the other group when a service has no known specialty', () => {
    const groups = groupServices([service('x'), service('a')], (id) => (id === 'a' ? THERAPY : null));

    expect(groups.map((group) => group.key)).toEqual(['1', 'other']);
    expect(groups[1]?.specialty).toBeNull();
  });

  it('should make one group when every service is of one specialty', () => {
    expect(groupServices([service('a'), service('b')], () => THERAPY)).toHaveLength(1);
  });

  it('should file by the label when the specialty has no code', () => {
    const groups = groupServices([service('a')], () => ({ label: 'Терапевт' }));

    expect(groups[0]?.key).toBe('Терапевт');
  });
});

describe('specialtyOfDoctors', () => {
  it('should take the specialty of the first doctor that has one', () => {
    expect(specialtyOfDoctors([doctor({}), doctor({ specialtyCode: '9', specialty: 'Хирург' })])).toEqual({ code: '9', label: 'Хирург' });
  });

  it('should return nothing when no doctor gives the service or none has a specialty', () => {
    expect(specialtyOfDoctors([])).toBeNull();
    expect(specialtyOfDoctors(undefined)).toBeNull();
    expect(specialtyOfDoctors([doctor({})])).toBeNull();
  });
});
