import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createValidationPipe } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { AppModule } from '../src/app/app.module';
import { applyE2eEnv } from './e2e-env';
import { ADMIN_SCOPE, bearer, DOCTOR_SCOPE, PATIENT_SCOPE } from '@medcenter/testing';

export const ROOM_PHYSICAL_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/location-physical-type';

export const TOKENS = {
  admin: bearer({ role: 'ADMIN', scope: ADMIN_SCOPE }),
  doctor: bearer({ role: 'DOCTOR', scope: DOCTOR_SCOPE, fhirUser: 'PractitionerRole/role-7' }),
  patient: bearer({ role: 'PATIENT', scope: PATIENT_SCOPE, patient: 'pat-1', fhirUser: 'Patient/pat-1' }),
} as const;

export function createFhirStub(): jest.Mocked<FhirClient> {
  return {
    search: jest.fn().mockResolvedValue({ entry: [] }),
    read: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    operation: jest.fn(),
    batch: jest.fn(),
  } as jest.Mocked<FhirClient>;
}

export async function bootWithFhir(fhir: jest.Mocked<FhirClient>): Promise<INestApplication> {
  applyE2eEnv();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FHIR_CLIENT)
    .useValue(fhir)
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  await app.init();
  return app;
}

export function storedRoom(overrides: Record<string, unknown> = {}): FhirResource {
  return {
    resourceType: 'Location',
    id: 'room-204',
    identifier: [{ value: '204-Х' }],
    name: 'Кабинет 204',
    description: 'Окна во двор',
    status: 'active',
    physicalType: { coding: [{ system: ROOM_PHYSICAL_TYPE_SYSTEM, code: 'ro', display: 'room' }] },
    ...overrides,
  };
}
