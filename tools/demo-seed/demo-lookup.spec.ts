import { DOCTORS, PATIENTS, ROOMS, SCHEDULES, SERVICES, SPECIALTIES } from './demo-catalog';
import { doctorOf, nsiServiceDisplay, roomOf, serviceOf, specialtyOf } from './demo-lookup';

function keysOf(items: ReadonlyArray<{ readonly key: string }>): string[] {
  return items.map((item) => item.key);
}

describe('demo catalog', () => {
  it.each([
    ['specialties', keysOf(SPECIALTIES)],
    ['rooms', keysOf(ROOMS)],
    ['services', keysOf(SERVICES)],
    ['doctors', keysOf(DOCTORS)],
    ['schedules', keysOf(SCHEDULES)],
  ])('should use unique business keys for %s because they become deterministic ids', (_name, keys) => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('should reference only doctors, services and rooms that exist', () => {
    for (const schedule of SCHEDULES) {
      expect(keysOf(DOCTORS)).toContain(schedule.doctorKey);
      expect(keysOf(SERVICES)).toContain(schedule.serviceKey);
      expect(keysOf(ROOMS)).toContain(schedule.roomKey);
    }
  });

  it('should give every doctor a catalog specialty and at least one schedule', () => {
    for (const doctor of DOCTORS) {
      expect(keysOf(SPECIALTIES)).toContain(doctor.specialtyKey);
      expect(SCHEDULES.some((schedule) => schedule.doctorKey === doctor.key)).toBe(true);
    }
  });

  it('should give every service at least one schedule, or it could never be booked', () => {
    for (const service of SERVICES) {
      expect(SCHEDULES.some((schedule) => schedule.serviceKey === service.key)).toBe(true);
    }
  });

  it('should keep the login of every demo account unique', () => {
    const locals = [...DOCTORS.map((doctor) => doctor.emailLocal), ...PATIENTS.map((patient) => patient.emailLocal)];

    expect(new Set(locals).size).toBe(locals.length);
  });
});

describe('lookups', () => {
  it('should find a catalog entry by its key', () => {
    expect(doctorOf('ivanova').family).toBe('Иванова');
    expect(roomOf('room-101').floor).toBe(1);
    expect(serviceOf('ecg').durationMin).toBe(20);
    expect(specialtyOf('cardiology').code).toBe('394579002');
  });

  it('should throw for a key that is not in the catalog instead of returning undefined', () => {
    expect(() => doctorOf('nobody')).toThrow('Unknown doctor key "nobody" in the demo catalog');
  });

  it('should take the display of a service code from the terminology snapshot', () => {
    expect(nsiServiceDisplay('10001')).toBe('Приём первичный терапевта');
  });

  it('should refuse a service code the snapshot does not hold', () => {
    expect(() => nsiServiceDisplay('99999')).toThrow(/not in the nsi-services terminology snapshot/);
  });
});
