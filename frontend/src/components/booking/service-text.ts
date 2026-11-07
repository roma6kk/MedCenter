const GENERIC_STEMS: ReadonlySet<string> = new Set(['прием', 'приём', 'консу', 'врача', 'визит', 'осмот', 'appoi', 'consu', 'visit', 'exami', 'with']);
const STEM_LENGTH = 5;
const MIN_WORD_LENGTH = 3;

function stemsOf(text: string): ReadonlySet<string> {
  const words: ReadonlyArray<string> = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= MIN_WORD_LENGTH);
  return new Set(words.map((word) => word.slice(0, STEM_LENGTH)));
}

export function isRedundantDescription(name: string, description: string): boolean {
  const nameStems: ReadonlySet<string> = stemsOf(name);
  const meaningful: ReadonlyArray<string> = [...stemsOf(description)].filter((stem) => !GENERIC_STEMS.has(stem));
  return meaningful.every((stem) => nameStems.has(stem));
}

export function visibleDescription(name: string, description: string | undefined): string | undefined {
  const text: string | undefined = description?.trim();
  return text === undefined || text === '' || isRedundantDescription(name, text) ? undefined : text;
}
