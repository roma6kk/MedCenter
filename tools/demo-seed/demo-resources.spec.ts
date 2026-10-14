import { FHIR_BY } from '../../libs/terminology/src/lib/canonical-urls';
import { MEDCENTER_EXT } from '../../libs/terminology/src/lib/extension-urls';
import servicesSnapshot from '../terminology-seed/snapshot/services.json';
import { DOCTORS, ROOMS, SCHEDULES, SERVICES, SPECIALTIES } from './demo-catalog';
import { DEMO_SEED_TAG, demoIds } from './demo-ids';
import {
  buildHealthcareServices,
  buildLocations,
  buildOrganization,
  buildPractitionerRoles,
  buildPractitioners,
  buildSchedules,
  fullNameOf,
  scheduleActors,
  windowsOf,
  type Horizon,
} from './demo-resources';
import { toMinutes, type WeeklyWindow } from './demo-slots';

const HORIZON: Horizon = { from: '2026-11-02', to: '2026-11-15' };
const FHIR_ID = /^[A-Za-z0-9\-.]{1,64}$/;

type Json = Record<string, unknown>;

function allResources(): Json[] {
  return [
    buildOrganization(),
    ...buildLocations(),
    ...buildPractitioners(),
    ...buildHealthcareServices(),
    ...buildPractitionerRoles(),
    ...buildSchedules(HORIZON),
  ];
}

function referencesOf(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item) => referencesOf(item, found));
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'reference' && typeof child === 'string') {
        found.push(child);
      } else {
        referencesOf(child, found);
      }
    }
  }
  return found;
}

function extensionOf(resource: Json, url: string): Json | undefined {
  return (resource['extension'] as Json[] | undefined)?.find((candidate) => candidate['url'] === url);
}

describe('demo resource ids', () => {
  it('should give every resource a UUID id that satisfies the FHIR id grammar and is unique per type', () => {
    const resources = allResources();
    const keys = resources.map((resource) => `${String(resource['resourceType'])}/${String(resource['id'])}`);

    expect(resources.every((resource) => FHIR_ID.test(String(resource['id'])))).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('should tag every resource so the demo data can be found by _tag', () => {
    expect(allResources().every((resource) => (resource['meta'] as Json)['tag'] !== undefined)).toBe(true);
    expect(buildOrganization()['meta']).toEqual({ tag: [DEMO_SEED_TAG] });
  });

  it('should resolve every reference to a resource the seed also writes', () => {
    const resources = allResources();
    const known = new Set(resources.map((resource) => `${String(resource['resourceType'])}/${String(resource['id'])}`));

    const dangling = resources.flatMap((resource) => referencesOf(resource)).filter((reference) => !known.has(reference));

    expect(dangling).toEqual([]);
  });
});

describe('buildLocations', () => {
  it('should write rooms like RoomsService: identifier value, physicalType room and the floor extension', () => {
    const [first] = buildLocations();

    expect(first).toMatchObject({
      resourceType: 'Location',
      status: 'active',
      identifier: [{ value: ROOMS[0].identifier }],
      physicalType: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'ro' }] },
      managingOrganization: { reference: `Organization/${demoIds.organization()}` },
    });
    expect(extensionOf(first, MEDCENTER_EXT.ROOM_FLOOR)).toEqual({ url: MEDCENTER_EXT.ROOM_FLOOR, valueInteger: ROOMS[0].floor });
  });
});

describe('buildPractitioners', () => {
  it('should write the name where toDoctorResponseDto reads it and the profession as qualification text', () => {
    const [ivanova] = buildPractitioners();
    const [name] = ivanova?.['name'] as Json[];

    expect(name).toMatchObject({ family: 'Иванова', given: ['Мария', 'Сергеевна'], text: 'Иванова Мария Сергеевна' });
    expect(ivanova?.['qualification']).toEqual([
      { code: { coding: [{ system: 'http://snomed.info/sct', code: '419192003', display: 'Терапия' }], text: 'Терапевт' } },
    ]);
  });

  it('should name doctors "Фамилия Имя Отчество"', () => {
    expect(fullNameOf(DOCTORS[1])).toBe('Петров Алексей Николаевич');
  });
});

describe('buildPractitionerRoles', () => {
  it('should link each role to its practitioner, the clinic, its rooms and the services it offers', () => {
    const roles = buildPractitionerRoles();
    const petrov = roles.find((role) => role.id === demoIds.practitionerRole('petrov'));

    expect(petrov).toMatchObject({
      active: true,
      practitioner: { reference: `Practitioner/${demoIds.practitioner('petrov')}` },
      organization: { reference: `Organization/${demoIds.organization()}` },
      specialty: [{ coding: [{ system: 'http://snomed.info/sct', code: '394579002' }] }],
    });
    expect(referencesOf(petrov?.['healthcareService'])).toEqual([
      `HealthcareService/${demoIds.service('card-primary')}`,
      `HealthcareService/${demoIds.service('ecg')}`,
    ]);
    expect(referencesOf(petrov?.['location'])).toEqual([`Location/${demoIds.room('room-204')}`, `Location/${demoIds.room('room-210')}`]);
  });

  it('should give every specialty of the catalog a SNOMED CT code', () => {
    expect(SPECIALTIES.every((specialty) => /^\d{6,18}$/.test(specialty.code))).toBe(true);
  });
});

describe('buildHealthcareServices', () => {
  it('should code the service type in the НСИ canonical with a code from the terminology snapshot', () => {
    const snapshotCodes = new Set(servicesSnapshot.map((concept) => concept.code));

    for (const service of buildHealthcareServices()) {
      const coding = ((service['type'] as Json[])[0]?.['coding'] as Json[])[0];
      expect(coding?.['system']).toBe(FHIR_BY.SERVICE_CODE_SYSTEM);
      expect(snapshotCodes.has(String(coding?.['code']))).toBe(true);
    }
  });

  it('should write the default duration in the SERVICE_DEFAULT_DURATION extension and the description as comment', () => {
    const [first] = buildHealthcareServices();

    expect(extensionOf(first, MEDCENTER_EXT.SERVICE_DEFAULT_DURATION)).toEqual({
      url: MEDCENTER_EXT.SERVICE_DEFAULT_DURATION,
      valueInteger: SERVICES[0].durationMin,
    });
    expect(first['comment']).toBe(SERVICES[0].description);
  });

  it('should keep the service duration equal to the slot length of the schedules that offer it', () => {
    for (const schedule of SCHEDULES) {
      const service = SERVICES.find((candidate) => candidate.key === schedule.serviceKey);
      expect(service?.durationMin).toBe(schedule.slotDurationMin);
    }
  });
});

describe('buildSchedules', () => {
  it('should write the actors in the order SchedulesService.create does: role, room, service', () => {
    const [first] = buildSchedules(HORIZON);

    expect(first['actor']).toEqual([
      { reference: `PractitionerRole/${demoIds.practitionerRole('ivanova')}` },
      { reference: `Location/${demoIds.room('room-101')}` },
      { reference: `HealthcareService/${demoIds.service('ter-primary')}` },
    ]);
    expect(first['actor']).toEqual(scheduleActors(SCHEDULES[0]));
  });

  it('should store duration, clinic-time weekly windows and the planning horizon in the three schedule extensions', () => {
    const [first] = buildSchedules(HORIZON);
    const windows = extensionOf(first, MEDCENTER_EXT.SCHEDULE_WEEKLY_WINDOWS)?.['valueString'];

    expect(extensionOf(first, MEDCENTER_EXT.SCHEDULE_SLOT_DURATION)).toEqual({ url: MEDCENTER_EXT.SCHEDULE_SLOT_DURATION, valueInteger: 30 });
    expect(extensionOf(first, MEDCENTER_EXT.SCHEDULE_PLANNING_HORIZON)).toEqual({
      url: MEDCENTER_EXT.SCHEDULE_PLANNING_HORIZON,
      valuePeriod: { start: '2026-11-02', end: '2026-11-15' },
    });
    expect(JSON.parse(String(windows))).toEqual(windowsOf(SCHEDULES[0]));
    expect(JSON.parse(String(windows))[0]).toEqual({ dayOfWeek: 'MO', startTime: '09:00', endTime: '13:00' });
  });

  it('should repeat the service code as Schedule.serviceType for service-type searches', () => {
    const [first] = buildSchedules(HORIZON);

    expect(first['serviceType']).toEqual([
      { coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: '10001', display: 'Приём первичный терапевта' }] },
    ]);
  });

  it('should never overlap two schedules of the same doctor (BR-007 / SCHEDULE_OVERLAP)', () => {
    const byDoctor = new Map<string, Array<{ key: string; window: WeeklyWindow }>>();
    for (const schedule of SCHEDULES) {
      const list = byDoctor.get(schedule.doctorKey) ?? [];
      windowsOf(schedule).forEach((window) => list.push({ key: schedule.key, window }));
      byDoctor.set(schedule.doctorKey, list);
    }

    for (const windows of byDoctor.values()) {
      for (const [index, left] of windows.entries()) {
        for (const right of windows.slice(index + 1)) {
          const isSameDay = left.window.dayOfWeek === right.window.dayOfWeek;
          const isOverlapping =
            toMinutes(left.window.startTime) < toMinutes(right.window.endTime) &&
            toMinutes(right.window.startTime) < toMinutes(left.window.endTime);
          expect(isSameDay && isOverlapping && left.key !== right.key).toBe(false);
        }
      }
    }
  });
});
