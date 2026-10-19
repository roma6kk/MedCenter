import { isApiError } from '@/lib/api/api-fetch';
import type { ProblemDetails } from '@/lib/api/problem';

/** The RFC 7807 problem of a failed request, or `null` for an error that did not come from the API. */
export function problemOf(error: unknown): ProblemDetails | null {
  return isApiError(error) ? error.problem : null;
}

/** Detail codes the services put in front of the message of a generic 409 (`CODE: text`), see api-designer-spec §2.2.6. */
export const KNOWN_DETAIL_CODES = [
  'EMAIL_TAKEN',
  'PRACTITIONER_ROLE_TAKEN',
  'SELF_LOCKOUT',
  'IMPORT_RUNNING',
  'SNAPSHOT_NOT_BUNDLED',
  'ROOM_IN_USE',
  'SERVICE_IN_USE',
  'SCHEDULE_IN_USE',
  'SCHEDULE_OVERLAP',
] as const;

export type KnownDetailCode = (typeof KNOWN_DETAIL_CODES)[number];

/** The `CODE:` the problem's `detail` starts with, when it is one the admin screens explain in Russian. */
export function detailCodeOf(problem: ProblemDetails | null): KnownDetailCode | null {
  if (problem === null || problem.detail === undefined) return null;
  const found = KNOWN_DETAIL_CODES.find((code) => problem.detail === code || problem.detail?.startsWith(`${code}:`) === true);
  return found ?? null;
}
