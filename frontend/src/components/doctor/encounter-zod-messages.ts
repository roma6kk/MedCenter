/**
 * encounter-zod-messages — Russian texts for the zod issues of `completeEncounterSchema`.
 *
 * The schema lives in `lib/contracts` (parity with the server's class-validator rules) and carries no messages; the form passes
 * this map to its resolver so the doctor reads `Введите код МКБ-10`, not `String must contain at least 3 character(s)`.
 */
import type { ZodErrorMap, ZodIssueOptionalMessage } from 'zod';
import { translate } from '@/lib/i18n/translate';

const COMMON = 'validation.';
const OWN = 'doctor.validation.';

function lastSegment(issue: ZodIssueOptionalMessage): string {
  return String(issue.path[issue.path.length - 1] ?? '');
}

function invalidStringMessage(issue: ZodIssueOptionalMessage): string {
  const field: string = lastSegment(issue);
  if (field === 'atcCode') return translate(`${OWN}atc`);
  if (field === 'code' && issue.path[0] === 'diagnoses') return translate(`${OWN}icd10`);
  return translate(`${COMMON}identifier`);
}

function tooSmallMessage(issue: ZodIssueOptionalMessage & { code: 'too_small' }): string {
  if (issue.type === 'array') return translate(issue.path[0] === 'diagnoses' ? `${OWN}diagnosesRequired` : `${COMMON}required`);
  if (issue.type === 'number') return translate(`${OWN}valueMin`, { min: Number(issue.minimum) });
  return Number(issue.minimum) <= 1 ? translate(`${COMMON}required`) : translate(`${OWN}minLength`, { count: Number(issue.minimum) });
}

/** The zod error map of the encounter form (`zodResolver(schema, { errorMap })`). */
export const encounterErrorMap: ZodErrorMap = (issue, context) => {
  switch (issue.code) {
    case 'invalid_type':
      return { message: translate(issue.received === 'undefined' || issue.received === 'null' ? `${COMMON}required` : `${COMMON}number`) };
    case 'too_small':
      return { message: tooSmallMessage(issue) };
    case 'too_big':
      return { message: issue.type === 'number' ? translate(`${OWN}valueMax`, { max: Number(issue.maximum) }) : translate(`${OWN}maxLength`, { count: Number(issue.maximum) }) };
    case 'invalid_string':
      return { message: invalidStringMessage(issue) };
    case 'invalid_enum_value':
      return { message: translate(`${COMMON}required`) };
    default:
      return { message: context.defaultError };
  }
};
