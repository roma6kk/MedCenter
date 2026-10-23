import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { AUTH_USER_IDENTIFIER_SYSTEM } from '../audit/audit-event.builder';
import { updateIfUnchanged } from '../fhir/versioned-update';

export type PatientGender = 'male' | 'female';

/** What the `auth` account knows about the person behind a PATIENT account. */
export interface PatientDemographics {
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: string;
  readonly gender?: PatientGender;
  /** Optional, `+375XXXXXXXXX` (API §2.2.6); stored as the `mobile` phone `telecom` entry. */
  readonly phone?: string;
}

/** Fields an admin PATCH may change on an already linked Patient. */
export interface PatientDemographicsChange {
  /** The account email, kept in the `home` email `telecom` entry. */
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly birthDate?: string;
  readonly gender?: PatientGender;
}

/** R4 `Patient` for a self-registered account (HL7 FHIR International R4 only). */
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

/** Replaces the `home` email entry (the one `buildPatient` writes) or adds it; other contact points stay. */
function withHomeEmail(patient: FhirResource, email: string): ReadonlyArray<ContactPoint> {
  const telecom = Array.isArray(patient['telecom']) ? (patient['telecom'] as ReadonlyArray<ContactPoint>) : [];
  const isHomeEmail = (point: ContactPoint): boolean => point['system'] === 'email' && point['use'] === 'home';
  if (!telecom.some(isHomeEmail)) {
    return [...telecom, { system: 'email', value: email, use: 'home' }];
  }
  return telecom.map((point) => (isHomeEmail(point) ? { ...point, value: email } : point));
}

/** Applies the change to the official `HumanName`, the email and the scalar fields, keeping everything else. */
export function applyDemographics(patient: FhirResource, change: PatientDemographicsChange): FhirResource {
  const names = Array.isArray(patient['name']) ? (patient['name'] as ReadonlyArray<Record<string, unknown>>) : [];
  const [official, ...others] = names;
  const name = {
    use: 'official',
    ...official,
    ...(change.lastName !== undefined ? { family: change.lastName } : {}),
    ...(change.firstName !== undefined ? { given: [change.firstName] } : {}),
  };
  return {
    ...patient,
    name: [name, ...others],
    ...(change.email !== undefined ? { telecom: withHomeEmail(patient, change.email) } : {}),
    ...(change.birthDate !== undefined ? { birthDate: change.birthDate } : {}),
    ...(change.gender !== undefined ? { gender: change.gender } : {}),
  };
}

/**
 * The `auth` service's narrow window onto HAPI: it creates the `Patient` of a
 * self-registration (API §2.2.6), keeps its demographics in step with an admin
 * edit, removes it when a registration has to be compensated, and checks that
 * a `PractitionerRole` exists before a doctor account is linked to it.
 */
@Injectable()
export class PatientProvisioner {
  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  /** Returns the server-assigned `Patient.id`. */
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

  /** `404 NOT_FOUND` (via `FhirClientError`) when HAPI has no such `PractitionerRole`. */
  async assertPractitionerRoleExists(practitionerRoleId: string): Promise<void> {
    await this.fhir.read('PractitionerRole', practitionerRoleId);
  }
}
