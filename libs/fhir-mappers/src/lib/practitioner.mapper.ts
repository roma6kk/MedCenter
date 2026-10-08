import type { FhirResource } from '@medcenter/fhir';

export interface DoctorResponseDto {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly specialty?: string;
  readonly roomId?: string;
}

function readHumanName(resource: FhirResource): { firstName: string; lastName: string } {
  const names = resource['name'];
  if (!Array.isArray(names) || names.length === 0) {
    return { firstName: '', lastName: '' };
  }
  const [name] = names as ReadonlyArray<Record<string, unknown>>;
  const given = Array.isArray(name?.['given']) ? (name['given'] as string[]) : [];
  return {
    firstName: given[0] ?? '',
    lastName: typeof name?.['family'] === 'string' ? name['family'] : '',
  };
}

/** FHIR `Practitioner` -> doctor catalog DTO (API §4.1–4.2). */
export function toDoctorResponseDto(practitioner: FhirResource): DoctorResponseDto {
  const { firstName, lastName } = readHumanName(practitioner);
  const specialty = practitioner['qualification'];
  return {
    id: practitioner.id ?? '',
    firstName,
    lastName,
    specialty:
      Array.isArray(specialty) && specialty.length > 0
        ? readQualificationCode(specialty[0])
        : undefined,
  };
}

function readQualificationCode(qualification: unknown): string | undefined {
  if (typeof qualification !== 'object' || qualification === null) {
    return undefined;
  }
  const { code } = qualification as { code?: unknown };
  if (typeof code !== 'object' || code === null) {
    return undefined;
  }
  const { text, coding } = code as { text?: unknown; coding?: unknown };
  if (typeof text === 'string') {
    return text;
  }
  if (Array.isArray(coding) && coding.length > 0) {
    const [first] = coding as ReadonlyArray<Record<string, unknown>>;
    return typeof first?.['display'] === 'string' ? first['display'] : undefined;
  }
  return undefined;
}
