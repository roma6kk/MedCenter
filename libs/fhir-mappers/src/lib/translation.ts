/**
 * Localized values of FHIR primitives (ru is the stored value, en is a translation).
 *
 * The English text lives next to the Russian one, in the standard HL7 FHIR R4 `translation` extension on the primitive
 * (`_name`, `_comment`, `_text`, `_given[i]`, `_family`): sub-extension `lang` (code) and `content` (string). The API
 * picks the language of the answer from `Accept-Language`; the DTO keeps its shape, only the values change.
 */

export type ContentLanguage = 'ru' | 'en';

export const DEFAULT_CONTENT_LANGUAGE: ContentLanguage = 'ru';

/** Canonical URL of the HL7 FHIR translation extension (R4 core). */
export const FHIR_TRANSLATION_EXTENSION = 'http://hl7.org/fhir/StructureDefinition/translation';

interface RawExtension {
  readonly url?: unknown;
  readonly valueCode?: unknown;
  readonly valueString?: unknown;
  readonly extension?: unknown;
}

/**
 * `Accept-Language` -> content language: the English tag with the highest weight wins over Russian, anything else
 * (no header, `de`, `*`, junk, `q=0`) is Russian, the language the data is stored in.
 */
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

/** The `translation` extension that carries `content` in `lang`; goes into `<element>.extension` of a primitive's `_element`. */
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

/**
 * The value of a primitive in `lang`: `original` is the stored (Russian) value, `element` is its sibling `_x` object
 * (may be absent). Russian, a missing translation or a blank one all give the original.
 */
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
