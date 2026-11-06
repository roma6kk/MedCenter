import type { HistoryItem, Prescription, VerificationStatus } from './doctor-types';

export const MAX_SUMMARY_ROWS = 5;

export interface RecentDiagnosis {
  readonly code: string;
  readonly display: string;
  readonly verificationStatus?: VerificationStatus;
  readonly date: string;
}

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

export function currentPrescriptions(items: ReadonlyArray<Prescription>): ReadonlyArray<Prescription> {
  return items.filter((item) => item.status === 'active');
}
