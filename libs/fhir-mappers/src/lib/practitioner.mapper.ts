import type { FhirResource } from '@medcenter/fhir';

import { DEFAULT_CONTENT_LANGUAGE, translated, type ContentLanguage } from './translation';

export interface DoctorResponseDto {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly middleName?: string;
  readonly specialty?: string;
  readonly specialtyCode?: string;
  readonly specialtySystem?: string;
  readonly photoUrl?: string;
}

function readHumanName(resource: FhirResource, lang: ContentLanguage): { firstName: string; lastName: string; middleName?: string } {
  const names = resource['name'];
  if (!Array.isArray(names) || names.length === 0) {
    return { firstName: '', lastName: '' };
  }
  const [name] = names as ReadonlyArray<Record<string, unknown>>;
  const given = Array.isArray(name?.['given']) ? (name['given'] as unknown[]) : [];
  const givenElements = Array.isArray(name?.['_given']) ? (name['_given'] as unknown[]) : [];
  const [first, second] = given;
  return {
    firstName: translated(typeof first === 'string' ? first : '', givenElements[0], lang),
    lastName: typeof name?.['family'] === 'string' ? translated(name['family'], name['_family'], lang) : '',
    ...(typeof second === 'string' && second.trim() !== '' ? { middleName: translated(second, givenElements[1], lang) } : {}),
  };
}

export function toDoctorResponseDto(practitioner: FhirResource, lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): DoctorResponseDto {
  const { firstName, lastName, middleName } = readHumanName(practitioner, lang);
  const specialty = practitioner['qualification'];
  const qualification = Array.isArray(specialty) && specialty.length > 0 ? specialty[0] : undefined;
  const coding = readQualificationCoding(qualification);
  const photoUrl = readPhotoUrl(practitioner);
  return {
    id: practitioner.id ?? '',
    firstName,
    lastName,
    ...(middleName === undefined ? {} : { middleName }),
    specialty: qualification === undefined ? undefined : readQualificationCode(qualification, lang),
    specialtyCode: coding?.code,
    specialtySystem: coding?.system,
    ...(photoUrl === undefined ? {} : { photoUrl }),
  };
}

function readPhotoUrl(practitioner: FhirResource): string | undefined {
  const photos = practitioner['photo'];
  if (!Array.isArray(photos)) {
    return undefined;
  }
  for (const photo of photos as ReadonlyArray<Record<string, unknown>>) {
    const url = photo?.['url'];
    if (typeof url === 'string' && url !== '') {
      return url;
    }
  }
  return undefined;
}

function readQualificationCoding(qualification: unknown): { code: string; system?: string } | undefined {
  const { code } = (qualification ?? {}) as { code?: { coding?: unknown } };
  const codings: readonly unknown[] = Array.isArray(code?.coding) ? code.coding : [];
  for (const coding of codings) {
    const { code: value, system } = (coding ?? {}) as { code?: unknown; system?: unknown };
    if (typeof value === 'string' && value !== '') {
      return { code: value, ...(typeof system === 'string' && system !== '' ? { system } : {}) };
    }
  }
  return undefined;
}

function readQualificationCode(qualification: unknown, lang: ContentLanguage): string | undefined {
  if (typeof qualification !== 'object' || qualification === null) {
    return undefined;
  }
  const { code } = qualification as { code?: unknown };
  if (typeof code !== 'object' || code === null) {
    return undefined;
  }
  const { text, _text: textElement, coding } = code as { text?: unknown; _text?: unknown; coding?: unknown };
  if (typeof text === 'string') {
    return translated(text, textElement, lang);
  }
  if (Array.isArray(coding) && coding.length > 0) {
    const [first] = coding as ReadonlyArray<Record<string, unknown>>;
    return typeof first?.['display'] === 'string' ? translated(first['display'], first['_display'], lang) : undefined;
  }
  return undefined;
}
