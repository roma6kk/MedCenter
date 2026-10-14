import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { UNKNOWN_SPECIALTY_CODE } from '../../database/entities/encounter-fact.entity';

/** First `PractitionerRole.specialty` (R4 CodeableConcept) reduced to one coding. */
export interface Specialty {
  readonly system: string | null;
  readonly code: string;
  readonly display: string | null;
}

export const UNKNOWN_SPECIALTY: Specialty = { system: null, code: UNKNOWN_SPECIALTY_CODE, display: null };

/** Roles of one practitioner inspected when the event carries `Practitioner/{id}`. */
const ROLE_SEARCH_LIMIT = 20;

const RELATIVE_REFERENCE = /^(PractitionerRole|Practitioner)\/([A-Za-z0-9\-.]{1,64})$/;

type Json = Readonly<Record<string, unknown>>;

function asObjects(value: unknown): ReadonlyArray<Json> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item: unknown): item is Json => typeof item === 'object' && item !== null);
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The first specialty with a usable coding (or text) wins; the text labels a bare code. */
export function specialtyOf(role: FhirResource): Specialty | undefined {
  for (const concept of asObjects(role['specialty'])) {
    const text = asText(concept['text']);
    const coding = asObjects(concept['coding']).find((candidate) => asText(candidate['code']) !== null);
    const code = asText(coding?.['code']);
    if (code !== null) {
      return { system: asText(coding?.['system']), code, display: asText(coding?.['display']) ?? text };
    }
    if (text !== null) {
      return { system: null, code: text, display: text };
    }
  }
  return undefined;
}

/**
 * API §9.2 groups encounters by specialty, which `encounter.completed.v1` does
 * not carry. It is resolved from HAPI once, at ingestion. A role that no longer
 * exists is filed under `unknown`; any other HAPI failure propagates, so the
 * delivery is retried rather than stored with the wrong label.
 */
@Injectable()
export class SpecialtyResolver {
  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  async resolve(practitionerRef: string): Promise<Specialty> {
    const match = RELATIVE_REFERENCE.exec(practitionerRef);
    const id = match?.[2];
    if (match === null || id === undefined) {
      return UNKNOWN_SPECIALTY;
    }
    const roles = match[1] === 'PractitionerRole' ? await this.readRole(id) : await this.rolesOf(practitionerRef);
    for (const role of roles) {
      const specialty = specialtyOf(role);
      if (specialty !== undefined) {
        return specialty;
      }
    }
    return UNKNOWN_SPECIALTY;
  }

  private async readRole(id: string): Promise<ReadonlyArray<FhirResource>> {
    try {
      return [await this.fhir.read('PractitionerRole', id)];
    } catch (error) {
      if (error instanceof FhirClientError && error.getStatus() === HttpStatus.NOT_FOUND) {
        return [];
      }
      throw error;
    }
  }

  private async rolesOf(practitionerRef: string): Promise<ReadonlyArray<FhirResource>> {
    const bundle = await this.fhir.search('PractitionerRole', {
      practitioner: practitionerRef,
      _elements: 'specialty',
      _count: ROLE_SEARCH_LIMIT,
    });
    return (bundle.entry ?? []).map((entry) => entry.resource);
  }
}
