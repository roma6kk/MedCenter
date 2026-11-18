import { FHIR_BY } from '../../libs/terminology/src/lib/canonical-urls';
import { MEDCENTER_EXT } from '../../libs/terminology/src/lib/extension-urls';
import { translationExtension } from '../../libs/fhir-mappers/src/lib/translation';
import type { FhirResource } from '../shared/fhir-http';
import {
  CLINIC,
  DOCTORS,
  doctorPhotoUrl,
  ROOMS,
  SCHEDULES,
  SERVICES,
  type DoctorDef,
  type ScheduleDef,
  type SpecialtyDef,
} from './demo-catalog';
import { CODE_SYSTEMS, DEMO_SEED_TAG, demoIds, IDENTIFIER_SYSTEMS } from './demo-ids';
import { doctorOf, nsiServiceDisplay, roomOf, serviceOf, specialtyOf } from './demo-lookup';
import { clinicWindows, type WeeklyWindow } from './demo-slots';

export interface Horizon {
  readonly from: string;
  readonly to: string;
}

type Json = Record<string, unknown>;

const META = { tag: [DEMO_SEED_TAG] } as const;
const ref = (type: string, id: string): { reference: string } => ({ reference: `${type}/${id}` });

export function fullNameOf(doctor: DoctorDef): string {
  return `${doctor.family} ${doctor.given} ${doctor.patronymic}`;
}

function english(content: string): Json {
  return { extension: [translationExtension('en', content)] };
}

function specialtyConcept(specialty: SpecialtyDef): Json {
  return {
    coding: [{ system: CODE_SYSTEMS.SNOMED_CT, code: specialty.code, display: specialty.display, _display: english(specialty.displayEn) }],
    text: specialty.profession,
    _text: english(specialty.professionEn),
  };
}

function serviceTypeConcept(typeCode: string): Json {
  return { coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: typeCode, display: nsiServiceDisplay(typeCode) }] };
}

export function buildOrganization(): FhirResource {
  return {
    resourceType: 'Organization',
    id: demoIds.organization(),
    meta: META,
    identifier: [{ system: IDENTIFIER_SYSTEMS.organization, value: CLINIC.key }],
    active: true,
    type: [{ coding: [{ system: CODE_SYSTEMS.ORGANIZATION_TYPE, code: 'prov', display: 'Healthcare Provider' }] }],
    name: CLINIC.name,
    alias: [CLINIC.alias],
    telecom: [
      { system: 'phone', value: CLINIC.phone, use: 'work' },
      { system: 'email', value: CLINIC.email, use: 'work' },
    ],
    address: [
      {
        use: 'work',
        type: 'physical',
        line: [CLINIC.addressLine],
        city: CLINIC.city,
        postalCode: CLINIC.postalCode,
        country: CLINIC.country,
      },
    ],
  };
}

export function buildLocations(): FhirResource[] {
  return ROOMS.map((room) => ({
    resourceType: 'Location',
    id: demoIds.room(room.key),
    meta: META,
    identifier: [{ system: IDENTIFIER_SYSTEMS.room, value: room.identifier }],
    status: 'active',
    name: room.name,
    description: room.description,
    mode: 'instance',
    physicalType: { coding: [{ system: CODE_SYSTEMS.LOCATION_PHYSICAL_TYPE, code: 'ro', display: 'Room' }] },
    managingOrganization: ref('Organization', demoIds.organization()),
    extension: [{ url: MEDCENTER_EXT.ROOM_FLOOR, valueInteger: room.floor }],
  }));
}

export function buildPractitioners(): FhirResource[] {
  return DOCTORS.map((doctor) => ({
    resourceType: 'Practitioner',
    id: demoIds.practitioner(doctor.key),
    meta: META,
    identifier: [{ system: IDENTIFIER_SYSTEMS.practitioner, value: doctor.key }],
    active: true,
    name: [
      {
        use: 'official',
        text: fullNameOf(doctor),
        family: doctor.family,
        _family: english(doctor.familyEn),
        given: [doctor.given, doctor.patronymic],
        _given: [english(doctor.givenEn), english(doctor.patronymicEn)],
      },
    ],
    gender: doctor.gender,
    photo: [{ contentType: 'image/jpeg', url: doctorPhotoUrl(doctor), title: fullNameOf(doctor) }],
    qualification: [{ code: specialtyConcept(specialtyOf(doctor.specialtyKey)) }],
  }));
}

function schedulesOf(doctor: DoctorDef): readonly ScheduleDef[] {
  return SCHEDULES.filter((schedule) => schedule.doctorKey === doctor.key);
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function buildPractitionerRoles(): FhirResource[] {
  return DOCTORS.map((doctor) => {
    const schedules = schedulesOf(doctor);
    return {
      resourceType: 'PractitionerRole',
      id: demoIds.practitionerRole(doctor.key),
      meta: META,
      active: true,
      practitioner: { ...ref('Practitioner', demoIds.practitioner(doctor.key)), display: fullNameOf(doctor) },
      organization: ref('Organization', demoIds.organization()),
      code: [{ coding: [{ system: CODE_SYSTEMS.PRACTITIONER_ROLE, code: 'doctor', display: 'Doctor' }] }],
      specialty: [specialtyConcept(specialtyOf(doctor.specialtyKey))],
      location: distinct(schedules.map((schedule) => schedule.roomKey)).map((key) => ref('Location', demoIds.room(key))),
      healthcareService: distinct(schedules.map((schedule) => schedule.serviceKey)).map((key) =>
        ref('HealthcareService', demoIds.service(key)),
      ),
    };
  });
}

export function buildHealthcareServices(): FhirResource[] {
  return SERVICES.map((service) => {
    const offered = SCHEDULES.filter((schedule) => schedule.serviceKey === service.key);
    const doctor = doctorOf(offered[0]?.doctorKey ?? '');
    return {
      resourceType: 'HealthcareService',
      id: demoIds.service(service.key),
      meta: META,
      active: true,
      providedBy: ref('Organization', demoIds.organization()),
      type: [serviceTypeConcept(service.typeCode)],
      specialty: [specialtyConcept(specialtyOf(doctor.specialtyKey))],
      location: distinct(offered.map((schedule) => schedule.roomKey)).map((key) => ref('Location', demoIds.room(key))),
      name: service.name,
      _name: english(service.nameEn),
      comment: service.description,
      _comment: english(service.descriptionEn),
      extension: [{ url: MEDCENTER_EXT.SERVICE_DEFAULT_DURATION, valueInteger: service.durationMin }],
    };
  });
}

export function windowsOf(schedule: ScheduleDef): WeeklyWindow[] {
  return clinicWindows(schedule.days, schedule.localStart, schedule.localEnd);
}

export function scheduleActors(schedule: ScheduleDef): Array<{ reference: string }> {
  return [
    ref('PractitionerRole', demoIds.practitionerRole(schedule.doctorKey)),
    ref('Location', demoIds.room(schedule.roomKey)),
    ref('HealthcareService', demoIds.service(schedule.serviceKey)),
  ];
}

function comment(schedule: ScheduleDef): string {
  const service = serviceOf(schedule.serviceKey);
  const room = roomOf(schedule.roomKey);
  return `${service.name}, ${room.name}: ${schedule.days.join('/')} ${schedule.localStart}-${schedule.localEnd} (время клиники, Минск)`;
}

export function buildSchedules(horizon: Horizon): FhirResource[] {
  return SCHEDULES.map((schedule) => ({
    resourceType: 'Schedule',
    id: demoIds.schedule(schedule.key),
    meta: META,
    active: true,
    serviceType: [serviceTypeConcept(serviceOf(schedule.serviceKey).typeCode)],
    actor: scheduleActors(schedule),
    extension: [
      { url: MEDCENTER_EXT.SCHEDULE_SLOT_DURATION, valueInteger: schedule.slotDurationMin },
      { url: MEDCENTER_EXT.SCHEDULE_WEEKLY_WINDOWS, valueString: JSON.stringify(windowsOf(schedule)) },
      { url: MEDCENTER_EXT.SCHEDULE_PLANNING_HORIZON, valuePeriod: { start: horizon.from, end: horizon.to } },
    ],
    comment: comment(schedule),
  }));
}
