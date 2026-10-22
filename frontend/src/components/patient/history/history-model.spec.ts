import { historyFixture, medicationFixture, serviceFixture } from '../cabinet-fixtures';
import { diagnosisFrequency, filterByDiagnosis, groupByMonth, prescriptionsByEncounter, primaryCode, summarize } from './history-model';

const visit = (id: string, date: string, overrides = {}) => historyFixture({ id, date, ...overrides });

describe('groupByMonth', () => {
  it('should group visits by clinic month keeping the order of the answer', () => {
    const groups = groupByMonth([visit('a', '2026-10-19T05:00:00Z'), visit('b', '2026-10-02T05:00:00Z'), visit('c', '2026-09-30T05:00:00Z')]);

    expect(groups.map((g) => [g.key, g.entries.map((e) => e.id)])).toEqual([['2026-10', ['a', 'b']], ['2026-09', ['c']]]);
  });

  it('should put a visit after midnight Minsk time into the next month', () => {
    expect(groupByMonth([visit('a', '2026-09-30T21:30:00Z')])[0]?.key).toBe('2026-10');
  });

  it('should answer no groups for no visits', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe('summarize', () => {
  it('should count visits, find the newest, count distinct practitioners and the top diagnosis', () => {
    const summary = summarize([
      visit('a', '2026-10-17T05:00:00Z', { practitionerRoleId: 'r1' }),
      visit('b', '2026-10-19T05:00:00Z', { practitionerRoleId: 'r2' }),
      visit('c', '2026-10-01T05:00:00Z', { practitionerRoleId: 'r1', diagnosis: 'I10', diagnoses: [] }),
    ]);

    expect(summary).toMatchObject({ completedVisits: 3, lastVisit: '2026-10-19T05:00:00Z', practitioners: 2, topDiagnosis: { code: 'J06.9', count: 2 } });
  });

  it('should skip cancelled visits', () => {
    expect(summarize([visit('a', '2026-10-17T05:00:00Z', { status: 'cancelled' })])).toEqual({ completedVisits: 0, practitioners: 0 });
  });

  it('should leave out the figures it cannot know for an empty page', () => {
    expect(summarize([])).toEqual({ completedVisits: 0, practitioners: 0 });
  });
});

describe('diagnosisFrequency', () => {
  it('should rank by count then code and scale the bars to the leader', () => {
    const list = diagnosisFrequency([
      visit('a', '2026-10-01T05:00:00Z', { diagnosis: 'J06', diagnoses: [{ code: 'J06', display: 'ОРВИ' }] }),
      visit('b', '2026-10-02T05:00:00Z'),
      visit('c', '2026-10-03T05:00:00Z'),
      visit('d', '2026-10-04T05:00:00Z', { diagnosis: '', diagnoses: [] }),
    ]);

    expect(list.map((d) => [d.code, d.count, d.share])).toEqual([['J06.9', 2, 1], ['J06', 1, 0.5]]);
    expect(list[1]?.display).toBe('ОРВИ');
  });
});

describe('primaryCode and filterByDiagnosis', () => {
  it('should fall back to the first listed diagnosis', () => {
    expect(primaryCode(visit('a', '2026-10-01T05:00:00Z', { diagnosis: '', diagnoses: [{ code: 'K29', display: '' }] }))).toBe('K29');
  });

  it('should keep only the visits of the chosen diagnosis, or all for null', () => {
    const entries = [visit('a', '2026-10-01T05:00:00Z'), visit('b', '2026-10-02T05:00:00Z', { diagnosis: 'I10', diagnoses: [] })];

    expect(filterByDiagnosis(entries, 'I10').map((e) => e.id)).toEqual(['b']);
    expect(filterByDiagnosis(entries, null)).toHaveLength(2);
  });
});

describe('prescriptionsByEncounter', () => {
  it('should key prescriptions by encounter and drop those without one', () => {
    const map = prescriptionsByEncounter([medicationFixture(), serviceFixture(), medicationFixture({ id: 'm2', encounterId: undefined })]);

    expect(map.get('enc-1')?.map((p) => p.id)).toEqual(['med-1', 'srv-1']);
    expect(map.size).toBe(1);
  });
});
