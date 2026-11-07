import type { FhirResource } from '@medcenter/fhir';
import { translated, type ContentLanguage } from '@medcenter/fhir-mappers';

const NAME_LANGUAGES: readonly ContentLanguage[] = ['ru', 'en'];

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function nameWords(text: string): string[] {
  return fold(text)
    .split(/\s+/)
    .filter((word) => word !== '');
}

function namePartWords(value: unknown, element: unknown): string[] {
  return typeof value === 'string' ? NAME_LANGUAGES.flatMap((lang) => nameWords(translated(value, element, lang))) : [];
}

function practitionerNameWords(practitioner: FhirResource): string[] {
  const names: readonly unknown[] = Array.isArray(practitioner['name']) ? practitioner['name'] : [];
  return names.flatMap((entry) => {
    const name = (entry ?? {}) as Record<string, unknown>;
    const given: readonly unknown[] = Array.isArray(name['given']) ? name['given'] : [];
    const givenElements: readonly unknown[] = Array.isArray(name['_given']) ? name['_given'] : [];
    return [namePartWords(name['family'], name['_family']), ...given.map((value, index) => namePartWords(value, givenElements[index]))].flat();
  });
}

// HAPI's `name` sees only the stored Russian text, one field at a time; every term word is matched as a prefix, in ru and en.
export function matchesName(practitioner: FhirResource, term: string): boolean {
  const words = nameWords(term);
  const names = practitionerNameWords(practitioner);
  return words.every((word) => names.some((name) => name.startsWith(word)));
}
