import { appointment } from './doctor-test-utils';
import { buildTimeline, clinicMinutes, countByStatus, findNextVisit, initialsOf, layoutBlocks, rangeLabel, shortName, workingDays } from './journal-model';

const visit = (id: string, start: string, end: string, status: 'booked' | 'noshow' | 'cancelled' | 'fulfilled' = 'booked') => appointment({ id, start, end, status });

describe('journal-model', () => {
  it('should put a gap line between visits only when the pause is an hour or more', () => {
    const entries = buildTimeline([
      visit('b', '2026-10-21T08:00:00Z', '2026-10-21T08:30:00Z'),
      visit('a', '2026-10-21T06:00:00Z', '2026-10-21T06:30:00Z'),
      visit('c', '2026-10-21T08:30:00Z', '2026-10-21T09:00:00Z'),
    ]);

    expect(entries.map((entry) => (entry.kind === 'gap' ? `gap:${entry.minutes}` : entry.visit.id))).toEqual(['a', 'gap:90', 'b', 'c']);
  });

  it('should take the first booked visit by time as the next one', () => {
    const rows = [visit('x', '2026-10-21T06:00:00Z', '2026-10-21T06:30:00Z', 'noshow'), visit('y', '2026-10-21T07:00:00Z', '2026-10-21T07:30:00Z'), visit('z', '2026-10-21T08:00:00Z', '2026-10-21T08:30:00Z')];

    expect(findNextVisit(rows)?.id).toBe('y');
    expect(findNextVisit([rows[0] as (typeof rows)[number]])).toBeUndefined();
  });

  it('should count visits by status', () => {
    expect(countByStatus([visit('a', '2026-10-21T06:00:00Z', '2026-10-21T06:30:00Z'), visit('b', '2026-10-21T07:00:00Z', '2026-10-21T07:30:00Z', 'cancelled')])).toEqual({ booked: 1, cancelled: 1, fulfilled: 0, noshow: 0, total: 2 });
  });

  it('should shorten names to a surname and an initial', () => {
    expect(shortName('Кузнецов Павел Иванович')).toBe('Кузнецов П.');
    expect(shortName('Кузнецов')).toBe('Кузнецов');
    expect(initialsOf('Кузнецов Павел')).toBe('КП');
  });

  it('should skip weekends when it lists working days', () => {
    expect(workingDays('2026-10-21')).toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27']);
    expect(workingDays('2026-10-24')[0]).toBe('2026-10-26');
    expect(rangeLabel(workingDays('2026-10-21'))).toBe('21–27.10');
  });

  it('should read the clock time in the clinic zone', () => {
    expect(clinicMinutes('2026-10-21T06:30:00Z')).toBe(9 * 60 + 30);
  });

  it('should place overlapping visits side by side', () => {
    const blocks = layoutBlocks([visit('a', '2026-10-21T07:30:00Z', '2026-10-21T08:00:00Z'), visit('b', '2026-10-21T07:30:00Z', '2026-10-21T08:00:00Z'), visit('c', '2026-10-21T08:00:00Z', '2026-10-21T08:30:00Z')], 9);

    expect(blocks.map((block) => [block.visit.id, block.left, block.width, block.top])).toEqual([['a', 0, 50, 120], ['b', 50, 50, 120], ['c', 0, 100, 160]]);
  });
});
