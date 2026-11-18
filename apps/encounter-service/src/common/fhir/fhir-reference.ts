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

export function canonicalReference(reference: unknown, type: string): string | undefined {
  const parsed = parseReference(reference);
  return parsed?.type === type ? `${parsed.type}/${parsed.id}` : undefined;
}

export function referenceIdOf(reference: unknown, type: string): string | undefined {
  const parsed = parseReference(reference);
  return parsed?.type === type ? parsed.id : undefined;
}
