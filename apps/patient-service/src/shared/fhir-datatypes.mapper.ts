/**
 * Readers for the R4 datatypes Patient and RelatedPerson share (HumanName,
 * ContactPoint, Identifier, CodeableConcept). HAPI returns untyped JSON, so
 * every reader narrows `unknown` defensively and drops malformed entries
 * instead of passing them to the client.
 */

export type AdministrativeGender = 'male' | 'female' | 'other' | 'unknown';

const ADMINISTRATIVE_GENDERS: ReadonlyArray<string> = ['male', 'female', 'other', 'unknown'];

/** Name order used in Belarus: «Фамилия Имя Отчество» (`family`, `given[0]`, `given[1]`). */
export interface PersonNameDto {
  readonly fullName: string;
  readonly lastName: string;
  readonly firstName: string;
  readonly middleName?: string;
}

export interface ContactPointDto {
  readonly system: string;
  readonly value: string;
  readonly use?: string;
}

export interface IdentifierDto {
  readonly system?: string;
  readonly value: string;
  readonly use?: string;
}

export interface CodingDto {
  readonly system?: string;
  readonly code?: string;
  readonly display: string;
}

type Json = Readonly<Record<string, unknown>>;

function isJson(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Array elements that are JSON objects; anything else (absent, scalar) yields `[]`. */
export function objectsOf(value: unknown): ReadonlyArray<Json> {
  return Array.isArray(value) ? value.filter(isJson) : [];
}

/** `official`, then `usual`, then the first name that is not `old`. */
function pickHumanName(names: ReadonlyArray<Json>): Json | undefined {
  const current = names.filter((name) => name['use'] !== 'old');
  return (
    current.find((name) => name['use'] === 'official') ??
    current.find((name) => name['use'] === 'usual') ??
    current[0]
  );
}

export function readPersonName(value: unknown): PersonNameDto {
  const name = pickHumanName(objectsOf(value));
  if (name === undefined) {
    return { fullName: '', lastName: '', firstName: '' };
  }
  const given = Array.isArray(name['given']) ? name['given'].filter((part): part is string => typeof part === 'string') : [];
  const lastName = stringOf(name['family']) ?? '';
  const middleName = given[1];
  const composed = [lastName, ...given].filter((part) => part.length > 0).join(' ');
  return {
    fullName: stringOf(name['text']) ?? composed,
    lastName,
    firstName: given[0] ?? '',
    ...(middleName === undefined ? {} : { middleName }),
  };
}

/** `Patient.gender` / `RelatedPerson.gender` — values outside the required ValueSet are dropped. */
export function readGender(value: unknown): AdministrativeGender | undefined {
  return typeof value === 'string' && ADMINISTRATIVE_GENDERS.includes(value) ? (value as AdministrativeGender) : undefined;
}

/** ContactPoints with a value; `use=old` ("no longer in use") is left out. */
export function readTelecom(value: unknown): ReadonlyArray<ContactPointDto> {
  return objectsOf(value)
    .filter((contact) => stringOf(contact['value']) !== undefined && contact['use'] !== 'old')
    .map((contact) => {
      const use = stringOf(contact['use']);
      return {
        system: stringOf(contact['system']) ?? 'other',
        value: String(contact['value']),
        ...(use === undefined ? {} : { use }),
      };
    });
}

/** Identifiers with a value; `use=old` is left out. */
export function readIdentifiers(value: unknown): ReadonlyArray<IdentifierDto> {
  return objectsOf(value)
    .filter((identifier) => stringOf(identifier['value']) !== undefined && identifier['use'] !== 'old')
    .map((identifier) => {
      const use = stringOf(identifier['use']);
      const system = stringOf(identifier['system']);
      return {
        ...(use === undefined ? {} : { use }),
        ...(system === undefined ? {} : { system }),
        value: String(identifier['value']),
      };
    });
}

/**
 * CodeableConcept → one entry per concept: the first coding supplies
 * `system`/`code`; `display` prefers the concept `text` (the localised label).
 */
export function readConcepts(value: unknown): ReadonlyArray<CodingDto> {
  return objectsOf(value).flatMap((concept) => {
    const coding = objectsOf(concept['coding'])[0];
    const system = stringOf(coding?.['system']);
    const code = stringOf(coding?.['code']);
    const display = stringOf(concept['text']) ?? stringOf(coding?.['display']) ?? code;
    if (display === undefined) {
      return [];
    }
    return [{ ...(system === undefined ? {} : { system }), ...(code === undefined ? {} : { code }), display }];
  });
}

export function readDate(value: unknown): string | undefined {
  return stringOf(value);
}

/** `active` is a modifier element; an absent value means the record is in use. */
export function readActive(value: unknown): boolean {
  return value !== false;
}
