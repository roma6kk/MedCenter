import type { Slot } from '@/components/catalog/catalog-types';
import {
  MAX_LOOKAHEAD_DAYS,
  SLOT_WINDOW_DAYS,
  clampToHorizon,
  clampToToday,
  formatSlotDateTime,
  formatDayHeading,
  formatDayShort,
  isIsoDay,
  formatSlotTime,
  groupSlotsByDay,
  minskDayOf,
  shiftDay,
  slotDurationMin,
  slotWindow,
} from './slot-time';

function slot(id: string, start: string, end: string, status: Slot['status'] = 'free'): Slot {
  return { id, scheduleId: 'sch-1', start, end, status };
}

describe('shiftDay', () => {
  it('should move a calendar day forward when the month ends', () => {
    expect(shiftDay('2026-10-30', 3)).toBe('2026-11-02');
  });

  it('should move a calendar day backwards when the year begins', () => {
    expect(shiftDay('2026-01-02', -3)).toBe('2025-12-30');
  });
});

describe('slotWindow', () => {
  it('should span two weeks, both ends inclusive, when no length is given', () => {
    expect(SLOT_WINDOW_DAYS).toBe(14);
    expect(slotWindow('2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-11-01' });
  });

  it('should stay inside the 31 days the API accepts when the default window is used', () => {
    expect(SLOT_WINDOW_DAYS).toBeLessThanOrEqual(31);
  });
});

describe('isIsoDay', () => {
  it('should accept the value when it is a real calendar day', () => {
    expect(isIsoDay('2026-10-19')).toBe(true);
  });

  it.each(['2026-02-30', '2026-13-01', '19.10.2026', '', '2026-10-19T00:00'])('should refuse %p when it is not a calendar day', (value) => {
    expect(isIsoDay(value)).toBe(false);
  });
});

describe('clampToToday', () => {
  it('should keep the day when it is later than today', () => {
    expect(clampToToday('2026-10-25', '2026-10-19')).toBe('2026-10-25');
  });

  it('should move the first day to today when it is past, invalid or missing', () => {
    expect(clampToToday('2026-10-01', '2026-10-19')).toBe('2026-10-19');
    expect(clampToToday('nonsense', '2026-10-19')).toBe('2026-10-19');
    expect(clampToToday(undefined, '2026-10-19')).toBe('2026-10-19');
  });
});

describe('formatDayShort', () => {
  it('should print day and abbreviated month when a day is formatted for the period label', () => {
    expect(formatDayShort('2026-10-19', 'ru')).toBe('19 окт.');
  });
});

describe('minskDayOf', () => {
  it('should use the clinic calendar day when it differs from the UTC day at the day boundary', () => {
    expect(minskDayOf('2026-10-19T21:30:00.000Z')).toBe('2026-10-20');
  });
});

describe('formatSlotTime', () => {
  it('should print the Minsk wall-clock time when a UTC instant is formatted', () => {
    expect(formatSlotTime('2026-10-19T11:00:00.000Z', 'ru')).toBe('14:00');
  });
});

describe('formatDayHeading', () => {
  it('should print weekday, day and month in Russian when the locale is ru', () => {
    expect(formatDayHeading('2026-10-19', 'ru')).toBe('понедельник, 19 октября');
  });

  it('should print the heading in English when the locale is en', () => {
    expect(formatDayHeading('2026-10-19', 'en')).toContain('19 October');
  });
});

describe('slotDurationMin', () => {
  it('should be the length of the slot in whole minutes when both bounds are dates', () => {
    expect(slotDurationMin(slot('a', '2026-10-19T11:00:00.000Z', '2026-10-19T11:20:00.000Z'))).toBe(20);
  });

  it('should be zero when the bounds of the slot are not dates', () => {
    expect(slotDurationMin(slot('a', 'nope', 'nope'))).toBe(0);
  });
});

describe('groupSlotsByDay', () => {
  it('should group by clinic day and sort days and slots ascending when slots come in any order', () => {
    const slots = [
      slot('c', '2026-10-20T07:00:00.000Z', '2026-10-20T07:30:00.000Z'),
      slot('b', '2026-10-19T12:00:00.000Z', '2026-10-19T12:30:00.000Z'),
      slot('a', '2026-10-19T11:00:00.000Z', '2026-10-19T11:30:00.000Z'),
    ];

    const days = groupSlotsByDay(slots);

    expect(days.map((day) => day.day)).toEqual(['2026-10-19', '2026-10-20']);
    expect(days[0]?.slots.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('should put a slot on the next Minsk day when it starts late in the evening UTC', () => {
    const days = groupSlotsByDay([slot('late', '2026-10-19T21:30:00.000Z', '2026-10-19T22:00:00.000Z')]);

    expect(days.map((day) => day.day)).toEqual(['2026-10-20']);
  });

  it('should return no groups when there are no slots', () => {
    expect(groupSlotsByDay([])).toEqual([]);
  });
});

describe('clampToHorizon', () => {
  const today = '2026-10-19';

  it('should keep a day inside the look-ahead when it is later than today', () => {
    expect(clampToHorizon('2026-12-01', today)).toBe('2026-12-01');
  });

  it('should stop at the last day the API accepts when the day is further ahead', () => {
    expect(clampToHorizon(shiftDay(today, MAX_LOOKAHEAD_DAYS + 30), today)).toBe(shiftDay(today, MAX_LOOKAHEAD_DAYS));
  });

  it('should move to today when the day is past or missing', () => {
    expect(clampToHorizon('2026-01-01', today)).toBe(today);
    expect(clampToHorizon(undefined, today)).toBe(today);
  });

  it('should stay inside the 366 days the API accepts when the horizon is used as a start', () => {
    expect(MAX_LOOKAHEAD_DAYS).toBeLessThanOrEqual(366);
  });
});

describe('Intl formatters of the slot picker', () => {
  const SLOT_COUNT = 300;
  /** 14 days of 16 half-hour slots from 08:00 Minsk time: the load of a doctor page. */
  const slots: ReadonlyArray<Slot> = Array.from({ length: SLOT_COUNT }, (_, index) => {
    const dayStart: number = Date.parse(`${shiftDay('2026-10-19', Math.floor(index / 16))}T05:00:00.000Z`);
    const start: number = dayStart + (index % 16) * 30 * 60_000;
    return slot(`s-${index}`, new Date(start).toISOString(), new Date(start + 30 * 60_000).toISOString());
  });

  function warmUp(): void {
    formatSlotTime('2026-10-19T11:00:00.000Z', 'ru');
    formatSlotTime('2026-10-19T11:00:00.000Z', 'en');
    formatDayHeading('2026-10-19', 'ru');
    formatDayShort('2026-10-19', 'ru');
    formatSlotDateTime('2026-10-19T11:00:00.000Z', 'ru');
    groupSlotsByDay(slots.slice(0, 2));
  }

  it('should construct no Intl.DateTimeFormat when 300 slots are grouped and formatted after the first use', () => {
    warmUp();
    const construct = jest.spyOn(Intl, 'DateTimeFormat');

    groupSlotsByDay(slots);
    slots.forEach((item) => formatSlotTime(item.start, 'ru'));
    ['2026-10-19', '2026-10-20', '2026-10-21'].forEach((day) => formatDayHeading(day, 'ru'));
    formatDayShort('2026-10-19', 'ru');
    formatSlotDateTime(slots[0]?.start ?? '', 'ru');

    expect(construct).not.toHaveBeenCalled();
    construct.mockRestore();
  });

  it('should keep a formatter per locale when both locales are used', () => {
    expect(formatSlotTime('2026-10-19T11:00:00.000Z', 'ru')).toBe('14:00');
    expect(formatSlotTime('2026-10-19T11:00:00.000Z', 'en')).toBe('14:00');
    expect(formatDayHeading('2026-10-19', 'ru')).toBe('понедельник, 19 октября');
    expect(formatDayHeading('2026-10-19', 'en')).toContain('19 October');
  });

  it('should return the same grouping when the list is grouped twice', () => {
    expect(groupSlotsByDay(slots)).toEqual(groupSlotsByDay(slots));
  });
});
