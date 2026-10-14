import { FHIR_BY } from '../../libs/terminology/src/lib/canonical-urls';
import { MEDCENTER_EXT } from '../../libs/terminology/src/lib/extension-urls';
import type { FhirResource } from '../shared/fhir-http';
import {
  CLINIC,
  DOCTORS,
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

/**
 * Pure R4 builders of the clinic's reference data. Each resource has the shape
 * the BFF services read and write (see the per-builder notes): extensions come
 * from `MEDCENTER_EXT`, the service type from the НСИ ЦИСЗ canonical, the
 * specialty is a SNOMED CT concept (what `PractitionerRole.specialty` carries
 * across the services). Only HL7 FHIR International R4 elements are used.
 */

export interface Horizon {
  /** First day of the planning horizon, `YYYY-MM-DD`. */
  readonly from: string;
  /** Last day of the planning horizon (inclusive), `YYYY-MM-DD`. */
  readonly to: string;
}

type Json = Record<string, unknown>;

const META = { tag: [DEMO_SEED_TAG] } as const;
const ref = (type: string, id: string): { reference: string } => ({ reference: `${type}/${id}` });

export function fullNameOf(doctor: DoctorDef): string {
  return `${doctor.family} ${doctor.given} ${doctor.patronymic}`;
}

function specialtyConcept(specialty: SpecialtyDef): Json {
  return {
    coding: [{ system: CODE_SYSTEMS.SNOMED_CT, code: specialty.code, display: specialty.display }],
    text: specialty.profession,
  };
}

function serviceTypeConcept(typeCode: string): Json {
  return { coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: typeCode, display: nsiServiceDisplay(typeCode) }] };
}

/** The clinic itself — the `managingOrganization` / `providedBy` / `organization` target of everything else. */
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

/**
 * Rooms, written like `RoomsService.toLocation` (identifier value, `physicalType`
 * room, floor in the `ROOM_FLOOR` extension), plus `status` and the owner.
 */
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

/**
 * Doctors. `toDoctorResponseDto` reads `name[0].given[0]` / `.family` and the
 * specialty from `qualification[0].code` (`text`, else `coding[0].display`).
 */
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
        given: [doctor.given, doctor.patronymic],
      },
    ],
    gender: doctor.gender,
    qualification: [{ code: specialtyConcept(specialtyOf(doctor.specialtyKey)) }],
  }));
}

function schedulesOf(doctor: DoctorDef): readonly ScheduleDef[] {
  return SCHEDULES.filter((schedule) => schedule.doctorKey === doctor.key);
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * One role per doctor. `practitioner` is what `PractitionerRole:practitioner`
 * `_include`, the doctor-slots lookup (`PractitionerRole?practitioner=`) and the
 * appointment views follow; `healthcareService` is what `PractitionerRole?service=`
 * filters on (doctor catalog by service); `specialty` is a coded SNOMED CT concept.
 */
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

/**
 * Services, written like `ServicesService.toHealthcareService`: `type` coded in
 * `nsi-services`, duration in `SERVICE_DEFAULT_DURATION`, description in
 * `comment`. Provider, location and specialty are derived from the schedules
 * that offer the service.
 */
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
      comment: service.description,
      extension: [{ url: MEDCENTER_EXT.SERVICE_DEFAULT_DURATION, valueInteger: service.durationMin }],
    };
  });
}

/** Weekly windows in clinic wall-clock time (API §5.2.1) — stored as is, the generator reads them as such. */
export function windowsOf(schedule: ScheduleDef): WeeklyWindow[] {
  return clinicWindows(schedule.days, schedule.localStart, schedule.localEnd);
}

/** The three actors of a schedule, in the order `SchedulesService.create` writes them. */
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

/**
 * Schedules, written like `SchedulesService.create`: actors
 * [PractitionerRole, Location, HealthcareService] and the three extensions
 * (slot duration, weekly windows as a JSON string in clinic time, planning horizon).
 * `serviceType` repeats the service code natively so `Schedule?service-type=` works.
 */
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
