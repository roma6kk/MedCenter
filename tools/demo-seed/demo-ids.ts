import { seedResourceId } from '../shared/deterministic-id';

export const demoIds = {
  organization: (): string => seedResourceId('Organization', 'medcenter'),
  room: (key: string): string => seedResourceId('Location', key),
  practitioner: (doctorKey: string): string => seedResourceId('Practitioner', doctorKey),
  practitionerRole: (doctorKey: string): string => seedResourceId('PractitionerRole', doctorKey),
  service: (key: string): string => seedResourceId('HealthcareService', key),
  schedule: (key: string): string => seedResourceId('Schedule', key),
} as const;

export const DEMO_SEED_TAG = { system: 'https://api.medcenter.by/fhir/seed', code: 'demo' } as const;

export const DEMO_TAG_SEARCH = `${DEMO_SEED_TAG.system}|${DEMO_SEED_TAG.code}`;

export const IDENTIFIER_SYSTEMS = {
  organization: 'https://api.medcenter.by/fhir/identifier/organization',
  room: 'https://api.medcenter.by/fhir/identifier/room',
  practitioner: 'https://api.medcenter.by/fhir/identifier/practitioner',
} as const;

export const CODE_SYSTEMS = {
  SNOMED_CT: 'http://snomed.info/sct',
  ORGANIZATION_TYPE: 'http://terminology.hl7.org/CodeSystem/organization-type',
  LOCATION_PHYSICAL_TYPE: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  PRACTITIONER_ROLE: 'http://terminology.hl7.org/CodeSystem/practitioner-role',
} as const;
