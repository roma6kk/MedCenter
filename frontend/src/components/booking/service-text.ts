/**
 * service-text — the catalogue gives a service a name and a description, and the description often only says the name
 * again with other words («Приём терапевта (первичный)» / «Первичная консультация терапевта»). Such a line is noise on a
 * card; one that adds something («ЭКГ в покое с расшифровкой») stays.
 */

/** Words that name a visit without saying anything about it. */
const GENERIC_STEMS: ReadonlySet<string> = new Set(['прием', 'приём', 'консу', 'врача', 'визит', 'осмот']);
const STEM_LENGTH = 5;
const MIN_WORD_LENGTH = 3;

function stemsOf(text: string): ReadonlySet<string> {
  const words: ReadonlyArray<string> = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= MIN_WORD_LENGTH);
  return new Set(words.map((word) => word.slice(0, STEM_LENGTH)));
}

/** `true` when every meaningful word of the description (five-letter stems, generic visit words ignored) is already in the name. */
export function isRedundantDescription(name: string, description: string): boolean {
  const nameStems: ReadonlySet<string> = stemsOf(name);
  const meaningful: ReadonlyArray<string> = [...stemsOf(description)].filter((stem) => !GENERIC_STEMS.has(stem));
  return meaningful.every((stem) => nameStems.has(stem));
}

/** The description to show under the name, or `undefined` when there is none or it repeats the title. */
export function visibleDescription(name: string, description: string | undefined): string | undefined {
  const text: string | undefined = description?.trim();
  return text === undefined || text === '' || isRedundantDescription(name, text) ? undefined : text;
}
