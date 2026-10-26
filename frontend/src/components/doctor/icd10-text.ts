/**
 * icd10-text — what the single diagnosis field of the completion form shows and what that text means (A7).
 * Pure helpers, so the rules are testable without the form: the field's text is not the form's `code`.
 */
import { ICD10_PATTERN } from '@/lib/contracts';

/** `j06.9` is meant as `J06.9`; free text (a diagnosis name being searched) is left alone. */
export function upperCaseCode(raw: string): string {
  return /^[a-z][0-9]/i.test(raw) ? raw.toUpperCase() : raw;
}

/** What the field shows while a search is typed: a code (even half of one) in capitals, a name as typed. */
export function upperCaseSearch(raw: string): string {
  return /^[a-z]\d{0,2}(\.\d{0,2})?$/i.test(raw.trim()) ? raw.toUpperCase() : raw;
}

/** The text of a field whose diagnosis is chosen: `J06.9 — Острая инфекция…`, or the bare code while the name is unknown. */
export function formatDiagnosis(code: string, display: string): string {
  if (code === '') return '';
  return display === '' ? code : `${code} — ${display}`;
}

/**
 * The form's `code` for what was typed: a code written out in full is the code; anything else (a name being searched, half a
 * code) is a search and leaves the code empty until a concept is picked from the list.
 */
export function codeOfTypedText(raw: string): string {
  const candidate: string = upperCaseCode(raw.trim());
  return ICD10_PATTERN.test(candidate) ? candidate : '';
}
