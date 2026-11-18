import { Inject, Injectable } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { translationExtension } from '@medcenter/fhir-mappers';
import { SPECIALTIES, type SpecialtyDef } from '@medcenter/terminology';
import { AUTH_USER_IDENTIFIER_SYSTEM } from '../audit/audit-event.builder';
import { updateIfUnchanged } from '../fhir/versioned-update';
import { invalidUserInput } from './user-errors';

const SNOMED_CT = 'http://snomed.info/sct';
const PRACTITIONER_ROLE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/practitioner-role';

export interface NewDoctor {
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly specialtyCode: string;
}

export interface DoctorIds {
  readonly practitionerId: string;
  readonly practitionerRoleId: string;
}

function english(content: string): Record<string, unknown> {
  return { extension: [translationExtension('en', content)] };
}

function specialtyConcept(specialty: SpecialtyDef): Record<string, unknown> {
  return {
    coding: [{ system: SNOMED_CT, code: specialty.code, display: specialty.display, _display: english(specialty.displayEn) }],
    text: specialty.profession,
    _text: english(specialty.professionEn),
  };
}

/** The same shape as the demo seed writes, so a new doctor is listed in the public catalog like a seeded one. */
@Injectable()
export class DoctorProvisioner {
  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  async create(doctor: NewDoctor): Promise<DoctorIds> {
    const specialty = SPECIALTIES.find((candidate) => candidate.code === doctor.specialtyCode);
    if (specialty === undefined) {
      throw invalidUserInput('specialtyCode: not a specialty of the clinic');
    }
    const fullName = `${doctor.lastName} ${doctor.firstName}`;
    const practitioner = await this.fhir.create('Practitioner', {
      resourceType: 'Practitioner',
      active: true,
      identifier: [{ system: AUTH_USER_IDENTIFIER_SYSTEM, value: doctor.userId }],
      name: [{ use: 'official', text: fullName, family: doctor.lastName, given: [doctor.firstName] }],
      qualification: [{ code: specialtyConcept(specialty) }],
    });
    try {
      const role = await this.fhir.create('PractitionerRole', {
        resourceType: 'PractitionerRole',
        active: true,
        practitioner: { reference: `Practitioner/${practitioner.id}`, display: fullName },
        code: [{ coding: [{ system: PRACTITIONER_ROLE_SYSTEM, code: 'doctor', display: 'Doctor' }] }],
        specialty: [specialtyConcept(specialty)],
      } as FhirResource);
      return { practitionerId: String(practitioner.id), practitionerRoleId: String(role.id) };
    } catch (error: unknown) {
      await this.fhir.delete('Practitioner', String(practitioner.id));
      throw error;
    }
  }

  async remove(ids: DoctorIds): Promise<void> {
    await this.fhir.delete('PractitionerRole', ids.practitionerRoleId);
    await this.fhir.delete('Practitioner', ids.practitionerId);
  }

  /**
   * Hides or shows the doctor in the public catalog. The role is switched too, so that booking and slot search
   * (which look at the role) and the doctor list (which looks at the Practitioner) agree.
   */
  async setActive(practitionerRoleId: string, active: boolean): Promise<void> {
    const role = await this.fhir.read('PractitionerRole', practitionerRoleId);
    await updateIfUnchanged(this.fhir, role, { ...role, active });
    const reference = (role['practitioner'] as { reference?: unknown } | undefined)?.reference;
    if (typeof reference === 'string' && reference.startsWith('Practitioner/')) {
      const practitioner = await this.fhir.read('Practitioner', reference.slice('Practitioner/'.length));
      await updateIfUnchanged(this.fhir, practitioner, { ...practitioner, active });
    }
  }
}
