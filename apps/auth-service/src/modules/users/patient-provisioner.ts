import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { AUTH_USER_IDENTIFIER_SYSTEM } from '../audit/audit-event.builder';
import { updateIfUnchanged } from '../fhir/versioned-update';

export type PatientGender = 'male' | 'female';

export interface PatientDemographics {
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: string;
  readonly gender?: PatientGender;
  readonly phone?: string;
}

export interface PatientDemographicsChange {
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly birthDate?: string;
  readonly gender?: PatientGender;
}

export function buildPatient(demographics: PatientDemographics): FhirResource {
  return {
    resourceType: 'Patient',
    active: true,
    identifier: [{ system: AUTH_USER_IDENTIFIER_SYSTEM, value: demographics.userId }],
    name: [{ use: 'official', family: demographics.lastName, given: [demographics.firstName] }],
    telecom: [
      { system: 'email', value: demographics.email, use: 'home' },
      ...(demographics.phone !== undefined ? [{ system: 'phone', value: demographics.phone, use: 'mobile' }] : []),
    ],
    birthDate: demographics.birthDate,
    ...(demographics.gender !== undefined ? { gender: demographics.gender } : {}),
  };
}

type ContactPoint = Readonly<Record<string, unknown>>;

function withHomeEmail(patient: FhirResource, email: string): ReadonlyArray<ContactPoint> {
  const telecom = Array.isArray(patient['telecom']) ? (patient['telecom'] as ReadonlyArray<ContactPoint>) : [];
  const isHomeEmail = (point: ContactPoint): boolean => point['system'] === 'email' && point['use'] === 'home';
  if (!telecom.some(isHomeEmail)) {
    return [...telecom, { system: 'email', value: email, use: 'home' }];
  }
  return telecom.map((point) => (isHomeEmail(point) ? { ...point, value: email } : point));
}

function furtherGiven(name: Record<string, unknown> | undefined): string[] {
  const given = name?.['given'];
  return Array.isArray(given) ? given.slice(1).filter((part): part is string => typeof part === 'string') : [];
}

export function applyDemographics(patient: FhirResource, change: PatientDemographicsChange): FhirResource {
  const names = Array.isArray(patient['name']) ? (patient['name'] as ReadonlyArray<Record<string, unknown>>) : [];
  const [official, ...others] = names;
  const renamed = change.lastName !== undefined || change.firstName !== undefined;
  // A rewritten name must not keep the old `text` (it would still be shown as the full name).
  const kept: Record<string, unknown> = { ...official };
  if (renamed) {
    delete kept['text'];
  }
  const name = {
    use: 'official',
    ...kept,
    ...(change.lastName !== undefined ? { family: change.lastName } : {}),
    ...(change.firstName !== undefined ? { given: [change.firstName, ...furtherGiven(official)] } : {}),
  };
  return {
    ...patient,
    name: [name, ...others],
    ...(change.email !== undefined ? { telecom: withHomeEmail(patient, change.email) } : {}),
    ...(change.birthDate !== undefined ? { birthDate: change.birthDate } : {}),
    ...(change.gender !== undefined ? { gender: change.gender } : {}),
  };
}

@Injectable()
export class PatientProvisioner {
  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  async create(demographics: PatientDemographics): Promise<string> {
    const created = await this.fhir.create('Patient', buildPatient(demographics));
    if (typeof created.id !== 'string' || created.id.length === 0) {
      throw new InternalServerErrorException({ errorCode: 'INTERNAL', message: 'HAPI returned a Patient without an id' });
    }
    return created.id;
  }

  async remove(patientId: string): Promise<void> {
    await this.fhir.delete('Patient', patientId);
  }

  /**
   * Read-modify-write guarded by `If-Match` (ADR-012): patient-service edits the
   * same `Patient`, so a change made between the read and the write is a
   * `409 CONFLICT` instead of a silently lost update.
   */
  async updateDemographics(patientId: string, change: PatientDemographicsChange): Promise<void> {
    const current = await this.fhir.read('Patient', patientId);
    await updateIfUnchanged(this.fhir, current, applyDemographics(current, change));
  }

  /**
   * Deletes whatever `Patient` HAPI holds for `userId`. For compensating a
   * registration whose `create` failed ambiguously (a timeout after HAPI had
   * already stored the resource), when the new id never reached us. The account
   * id is a fresh UUID, so the identifier matches only that attempt's Patient.
   */
  async removeCreatedFor(userId: string): Promise<void> {
    const found = await this.fhir.search('Patient', {
      identifier: `${AUTH_USER_IDENTIFIER_SYSTEM}|${userId}`,
      _elements: 'id',
    });
    for (const entry of found.entry ?? []) {
      if (typeof entry.resource.id === 'string') {
        await this.fhir.delete('Patient', entry.resource.id);
      }
    }
  }

  async assertPractitionerRoleExists(practitionerRoleId: string): Promise<void> {
    await this.fhir.read('PractitionerRole', practitionerRoleId);
  }
}
