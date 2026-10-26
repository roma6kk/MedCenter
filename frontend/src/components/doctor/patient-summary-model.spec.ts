import type { HistoryItem, Prescription } from './doctor-types';
import { buildRecentDiagnoses, currentPrescriptions, MAX_SUMMARY_ROWS } from './patient-summary-model';

function visit(id: string, date: string, codes: ReadonlyArray<string>): HistoryItem {
  return {
    id,
    date,
    status: 'finished',
    diagnosis: codes.join(', '),
    diagnoses: codes.map((code) => ({ code, display: `Диагноз ${code}`, verificationStatus: 'confirmed' as const })),
    appointmentId: `a-${id}`,
    practitionerRoleId: 'role-1',
  };
}

describe('buildRecentDiagnoses', () => {
  it('should list each code once, with the date of the newest visit that carried it', () => {
    const result = buildRecentDiagnoses([visit('2', '2026-10-14T06:00:00Z', ['J06.9']), visit('1', '2026-09-01T06:00:00Z', ['J06.9', 'I10'])]);

    expect(result.map((entry) => [entry.code, entry.date])).toEqual([['J06.9', '2026-10-14T06:00:00Z'], ['I10', '2026-09-01T06:00:00Z']]);
  });

  it('should keep only a handful of rows', () => {
    const codes = Array.from({ length: 12 }, (_, index) => `A0${index}`);

    expect(buildRecentDiagnoses([visit('1', '2026-10-14T06:00:00Z', codes)])).toHaveLength(MAX_SUMMARY_ROWS);
  });

  it('should return nothing for a patient without visits', () => {
    expect(buildRecentDiagnoses([])).toEqual([]);
  });
});

describe('currentPrescriptions', () => {
  const order = (id: string, status: string): Prescription => ({ id, kind: 'service', status, codeSystem: 's', code: id });

  it('should keep the orders in force and drop the finished and cancelled ones', () => {
    expect(currentPrescriptions([order('a', 'active'), order('b', 'completed'), order('c', 'cancelled')]).map((item) => item.id)).toEqual(['a']);
  });
});
