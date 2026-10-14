/**
 * `Type/id` at the end of a reference, optionally followed by `/_history/n`.
 * Anything before it (an absolute base URL) is ignored, so relative, absolute
 * and versioned forms of one reference compare equal.
 */
const REFERENCE_PATTERN = /(?:^|\/)([A-Z][A-Za-z]+)\/([A-Za-z0-9\-.]{1,64})(?:\/_history\/[A-Za-z0-9\-.]{1,64})?$/;

export interface ParsedReference {
  readonly type: string;
  readonly id: string;
}

export function parseReference(reference: unknown): ParsedReference | undefined {
  if (typeof reference !== 'string') {
    return undefined;
  }
  const match = REFERENCE_PATTERN.exec(reference);
  const type = match?.[1];
  const id = match?.[2];
  return type === undefined || id === undefined ? undefined : { type, id };
}

/** Canonical relative form `Type/id` of a reference of the given type, or `undefined`. */
export function canonicalReference(reference: unknown, type: string): string | undefined {
  const parsed = parseReference(reference);
  return parsed?.type === type ? `${parsed.type}/${parsed.id}` : undefined;
}

/** Bare id of a reference of the given type (`Patient/pat-1` → `pat-1`), or `undefined`. */
export function referenceIdOf(reference: unknown, type: string): string | undefined {
  const parsed = parseReference(reference);
  return parsed?.type === type ? parsed.id : undefined;
}
