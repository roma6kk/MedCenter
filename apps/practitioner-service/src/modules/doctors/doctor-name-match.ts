import type { FhirResource } from '@medcenter/fhir';
import { translated, type ContentLanguage } from '@medcenter/fhir-mappers';

/** Both languages of a name are searched whichever one the page is shown in. */
const NAME_LANGUAGES: readonly ContentLanguage[] = ['ru', 'en'];

/** A name part in lower case, without accents (`ё` is `е`, as in HAPI's own string search). */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The folded words of a text, split at whitespace. */
export function nameWords(text: string): string[] {
  return fold(text)
    .split(/\s+/)
    .filter((word) => word !== '');
}

/** One name part (`family`, one `given`) with its `_x` element, which holds the English translation. */
function namePartWords(value: unknown, element: unknown): string[] {
  return typeof value === 'string' ? NAME_LANGUAGES.flatMap((lang) => nameWords(translated(value, element, lang))) : [];
}

/** The folded words of every name of a practitioner: family and each given name (first name, patronymic), in ru and en. */
function practitionerNameWords(practitioner: FhirResource): string[] {
  const names: readonly unknown[] = Array.isArray(practitioner['name']) ? practitioner['name'] : [];
  return names.flatMap((entry) => {
    const name = (entry ?? {}) as Record<string, unknown>;
    const given: readonly unknown[] = Array.isArray(name['given']) ? name['given'] : [];
    const givenElements: readonly unknown[] = Array.isArray(name['_given']) ? name['_given'] : [];
    return [namePartWords(name['family'], name['_family']), ...given.map((value, index) => namePartWords(value, givenElements[index]))].flat();
  });
}

/**
 * `true` when every word of `term` is the start of some word of the doctor's name, in any order and in either language
 * (`Мария Иванова`, `Иванова Мар`, `ivanova maria`, `Иван` all find «Иванова Мария Сергеевна»). HAPI's `name` parameter could
 * not do it: it sees only the stored Russian text, one field at a time, and not the English translation.
 */
export function matchesName(practitioner: FhirResource, term: string): boolean {
  const words = nameWords(term);
  const names = practitionerNameWords(practitioner);
  return words.every((word) => names.some((name) => name.startsWith(word)));
}
