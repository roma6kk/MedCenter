import type { HistoryItem, Prescription, VerificationStatus } from './doctor-types';

/** The summary is a glance, not the record: a handful of rows per block, the full lists live beside it. */
export const MAX_SUMMARY_ROWS = 5;

export interface RecentDiagnosis {
  readonly code: string;
  readonly display: string;
  readonly verificationStatus?: VerificationStatus;
  /** When the newest visit that carried this diagnosis took place. */
  readonly date: string;
}

/**
 * The distinct diagnoses of the finished visits, newest first. The history says nothing about a diagnosis being resolved,
 * so "recent" is the honest word: a code is listed once, with the date and the verification status of its latest visit.
 */
export function buildRecentDiagnoses(history: ReadonlyArray<HistoryItem>): ReadonlyArray<RecentDiagnosis> {
  const seen = new Set<string>();
  const result: RecentDiagnosis[] = [];
  for (const visit of history) {
    for (const diagnosis of visit.diagnoses) {
      if (seen.has(diagnosis.code)) continue;
      seen.add(diagnosis.code);
      result.push({
        code: diagnosis.code,
        display: diagnosis.display,
        ...(diagnosis.verificationStatus === undefined ? {} : { verificationStatus: diagnosis.verificationStatus }),
        date: visit.date,
      });
    }
  }
  return result.slice(0, MAX_SUMMARY_ROWS);
}

/** Orders still in force (`status: active`), as the prescription list returns them. */
export function currentPrescriptions(items: ReadonlyArray<Prescription>): ReadonlyArray<Prescription> {
  return items.filter((item) => item.status === 'active');
}
