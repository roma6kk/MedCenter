/** ru is the stored value; the English text lives in the HL7 `translation` extension on the primitive (`_name`, `_given[i]`, ...). */

export type ContentLanguage = 'ru' | 'en';

export const DEFAULT_CONTENT_LANGUAGE: ContentLanguage = 'ru';

export const FHIR_TRANSLATION_EXTENSION = 'http://hl7.org/fhir/StructureDefinition/translation';

interface RawExtension {
  readonly url?: unknown;
  readonly valueCode?: unknown;
  readonly valueString?: unknown;
  readonly extension?: unknown;
}

export function resolveContentLanguage(header: string | readonly string[] | undefined): ContentLanguage {
  const value = typeof header === 'string' ? header : header?.[0];
  if (value === undefined) {
    return DEFAULT_CONTENT_LANGUAGE;
  }
  let best: { readonly language: ContentLanguage; readonly weight: number } | undefined;
  for (const part of value.split(',')) {
    const [tag = '', ...params] = part.trim().split(';');
    const primary = tag.trim().toLowerCase().split('-')[0];
    if (primary !== 'en' && primary !== 'ru') {
      continue;
    }
    const weightParam = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
    const weight = weightParam === undefined ? 1 : Number(weightParam.slice(2));
    if (!Number.isFinite(weight) || weight <= 0) {
      continue;
    }
    if (best === undefined || weight > best.weight) {
      best = { language: primary, weight };
    }
  }
  return best?.language ?? DEFAULT_CONTENT_LANGUAGE;
}

export function translationExtension(
  lang: ContentLanguage,
  content: string,
): { url: string; extension: Array<{ url: string; valueCode?: string; valueString?: string }> } {
  return {
    url: FHIR_TRANSLATION_EXTENSION,
    extension: [
      { url: 'lang', valueCode: lang },
      { url: 'content', valueString: content },
    ],
  };
}

function contentOf(extension: RawExtension, lang: ContentLanguage): string | undefined {
  if (extension.url !== FHIR_TRANSLATION_EXTENSION || !Array.isArray(extension.extension)) {
    return undefined;
  }
  const parts = extension.extension as readonly RawExtension[];
  const language = parts.find((part) => part.url === 'lang')?.valueCode;
  const content = parts.find((part) => part.url === 'content')?.valueString;
  if (language !== lang || typeof content !== 'string' || content.trim() === '') {
    return undefined;
  }
  return content;
}

export function translated(original: string, element: unknown, lang: ContentLanguage): string {
  if (lang === DEFAULT_CONTENT_LANGUAGE || typeof element !== 'object' || element === null) {
    return original;
  }
  const extensions = (element as { extension?: unknown }).extension;
  if (!Array.isArray(extensions)) {
    return original;
  }
  for (const extension of extensions as readonly RawExtension[]) {
    const content = contentOf(extension ?? {}, lang);
    if (content !== undefined) {
      return content;
    }
  }
  return original;
}
