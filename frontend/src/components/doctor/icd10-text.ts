import { ICD10_PATTERN } from '@/lib/contracts';

export function upperCaseCode(raw: string): string {
  return /^[a-z][0-9]/i.test(raw) ? raw.toUpperCase() : raw;
}

export function upperCaseSearch(raw: string): string {
  return /^[a-z]\d{0,2}(\.\d{0,2})?$/i.test(raw.trim()) ? raw.toUpperCase() : raw;
}

export function formatDiagnosis(code: string, display: string): string {
  if (code === '') return '';
  return display === '' ? code : `${code} — ${display}`;
}

export function codeOfTypedText(raw: string): string {
  const candidate: string = upperCaseCode(raw.trim());
  return ICD10_PATTERN.test(candidate) ? candidate : '';
}
