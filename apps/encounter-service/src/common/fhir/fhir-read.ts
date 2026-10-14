/**
 * Narrow, type-safe readers over loosely typed FHIR JSON (`FhirResource` is an
 * index signature of `unknown`). They never throw: a missing or mistyped
 * element reads as `undefined` / an empty list.
 */

export interface CodingView {
  readonly system?: string;
  readonly code?: string;
  readonly display?: string;
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringField(source: unknown, key: string): string | undefined {
  if (!isRecord(source)) {
    return undefined;
  }
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

export function numberField(source: unknown, key: string): number | undefined {
  if (!isRecord(source)) {
    return undefined;
  }
  const value = source[key];
  return typeof value === 'number' ? value : undefined;
}

export function arrayField(source: unknown, key: string): readonly unknown[] {
  if (!isRecord(source)) {
    return [];
  }
  const value = source[key];
  return Array.isArray(value) ? value : [];
}

/** `element.reference` of a `Reference` stored under `key`, e.g. `subject`. */
export function referenceField(source: unknown, key: string): string | undefined {
  return isRecord(source) ? stringField(source[key], 'reference') : undefined;
}

/** First `coding` of the `CodeableConcept` stored under `key`. */
export function firstCoding(source: unknown, key: string): CodingView | undefined {
  if (!isRecord(source)) {
    return undefined;
  }
  const coding = arrayField(source[key], 'coding')[0];
  if (!isRecord(coding)) {
    return undefined;
  }
  return {
    system: stringField(coding, 'system'),
    code: stringField(coding, 'code'),
    display: stringField(coding, 'display'),
  };
}

/** Text of the first `Annotation` in `note[]`. */
export function firstNote(source: unknown): string | undefined {
  return stringField(arrayField(source, 'note')[0], 'text');
}
