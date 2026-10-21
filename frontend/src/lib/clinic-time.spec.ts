import { useUiStore } from '@/store/use-ui-store';
import {
  ageInYears,
  clinicDateKey,
  clinicDayBounds,
  clinicDayOf,
  daysBetween,
  formatClinicDate,
  formatClinicDateTime,
  formatClinicTime,
  formatDateKey,
  formatDayHeading,
  formatDayShort,
  groupSlotsByDay,
  isDateKey,
  localizeInstants,
  shiftDateKey,
} from './clinic-time';

function slot(id: string, start: string): { readonly id: string; readonly start: string } {
  return { id, start };
}

describe('calendar days', () => {
  describe('clinicDayBounds', () => {
    it('should bound a clinic day with the Minsk offset when the day is requested', () => {
      expect(clinicDayBounds('2026-10-20')).toEqual({ from: '2026-10-20T00:00:00+03:00', to: '2026-10-20T23:59:59+03:00' });
    });
  });

  describe('shiftDateKey', () => {
    it('should cross a month boundary when a day is added', () => {
      expect(shiftDateKey('2026-10-31', 1)).toBe('2026-11-01');
    });

    it('should cross a year boundary when a day is subtracted', () => {
      expect(shiftDateKey('2027-01-01', -1)).toBe('2026-12-31');
    });

    it('should move by a whole period when several days are added', () => {
      expect(shiftDateKey('2026-10-16', 14)).toBe('2026-10-30');
    });

    it('should add a leap day without drifting when the year is a leap year', () => {
      expect(shiftDateKey('2028-02-28', 1)).toBe('2028-02-29');
      expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31');
    });

    it('should return the text as it came when it is not a calendar day', () => {
      expect(shiftDateKey('nope', 3)).toBe('nope');
    });
  });

  describe('daysBetween', () => {
    it('should count whole days and go negative when the order is reversed', () => {
      expect(daysBetween('2026-10-01', '2026-10-16')).toBe(15);
      expect(daysBetween('2026-10-16', '2026-10-01')).toBe(-15);
    });

    it('should be NaN when a key cannot be read', () => {
      expect(daysBetween('nope', '2026-10-01')).toBeNaN();
    });
  });

  describe('isDateKey', () => {
    it('should accept a real calendar date', () => {
      expect(isDateKey('2026-02-28')).toBe(true);
      expect(isDateKey('2026-10-19')).toBe(true);
    });

    it.each(['2026-02-30', '2026-13-01', '2026-02', '19.10.2026', '', '2026-10-19T00:00'])('should reject %p when it is not a calendar day', (value) => {
      expect(isDateKey(value)).toBe(false);
    });
  });

  describe('clinicDayOf', () => {
    it('should read the clinic day when the UTC instant is already the next day in Minsk', () => {
      expect(clinicDayOf('2026-10-20T21:30:00Z')).toBe('2026-10-21');
      expect(clinicDayOf('2026-10-19T21:30:00.000Z')).toBe('2026-10-20');
    });

    it('should keep the same day when the instant is midday', () => {
      expect(clinicDayOf('2026-10-20T09:00:00Z')).toBe('2026-10-20');
    });
  });

  describe('clinicDateKey', () => {
    it('should take today in the clinic zone when the instant is near midnight', () => {
      expect(clinicDateKey(new Date('2026-10-15T22:30:00.000Z'))).toBe('2026-10-16');
    });

    it('should be empty when the date is invalid', () => {
      expect(clinicDateKey(new Date('nope'))).toBe('');
    });
  });

  describe('ageInYears', () => {
    it('should not count the current year when the birthday has not come yet', () => {
      expect(ageInYears('1978-07-21', '2026-07-20')).toBe(47);
    });

    it('should count the current year when today is the birthday', () => {
      expect(ageInYears('1978-07-21', '2026-07-21')).toBe(48);
    });

    it('should return null when FHIR sent only a year', () => {
      expect(ageInYears('1978', '2026-07-21')).toBeNull();
    });

    it('should return null when the birth date is in the future', () => {
      expect(ageInYears('2030-01-01', '2026-07-21')).toBeNull();
    });
  });
});

describe('formatting', () => {
  afterEach(() => useUiStore.setState({ locale: 'ru' }));

  describe('formatClinicDateTime', () => {
    it('should show an instant in the Minsk zone (UTC+3) when the locale is ru', () => {
      expect(formatClinicDateTime('2026-10-19T07:00:00.000Z', 'ru')).toMatch(/10:00/);
    });

    it('should roll the date over when the Minsk day is later than the UTC day', () => {
      expect(formatClinicDateTime('2026-10-19T22:30:00.000Z', 'en')).toMatch(/20 Oct 2026.*01:30/);
    });

    it('should name the month in the language of the interface when the locale differs', () => {
      expect(formatClinicDateTime('2026-10-15T22:30:00.000Z', 'ru')).toContain('окт');
      expect(formatClinicDateTime('2026-10-15T22:30:00.000Z', 'en')).toContain('Oct');
    });

    it('should return the raw text when the value is not a date', () => {
      expect(formatClinicDateTime('soon', 'ru')).toBe('soon');
    });

    it('should follow the language of the interface when no locale is passed', () => {
      useUiStore.setState({ locale: 'en' });

      expect(formatClinicDateTime('2026-10-19T22:30:00.000Z')).toMatch(/20 Oct 2026/);
    });
  });

  describe('formatClinicTime', () => {
    it('should show the clinic wall clock when the instant is given in UTC', () => {
      expect(formatClinicTime('2026-10-20T06:00:00Z', 'ru')).toBe('09:00');
      expect(formatClinicTime('2026-10-19T11:00:00.000Z', 'ru')).toBe('14:00');
    });

    it('should keep the 24-hour clinic clock when the English interface is selected', () => {
      useUiStore.setState({ locale: 'en' });

      expect(formatClinicTime('2026-10-20T13:30:00Z')).toBe('16:30');
      expect(formatClinicTime('2026-10-19T22:30:00.000Z', 'en')).toBe('01:30');
    });

    it('should return the raw text when the value is not a date', () => {
      expect(formatClinicTime('later', 'en')).toBe('later');
    });
  });

  describe('formatClinicDate', () => {
    it('should show only the day of an instant in the clinic zone', () => {
      expect(formatClinicDate('2026-10-19T22:30:00.000Z', 'en')).toBe('20 Oct 2026');
    });

    it('should keep a bare calendar day on the same day when it has no time', () => {
      expect(formatClinicDate('2026-10-15', 'en')).toBe('15 October 2026');
    });

    it('should return the raw text when the value is not a date', () => {
      expect(formatClinicDate('', 'ru')).toBe('');
    });
  });

  describe('formatDateKey', () => {
    it('should read a calendar day without drifting through the browser zone when the key is formatted', () => {
      expect(formatDateKey('2026-10-20')).toMatch(/^20 окт/);
    });

    it('should follow the English interface language when it is selected', () => {
      useUiStore.setState({ locale: 'en' });

      expect(formatDateKey('2026-10-20')).toMatch(/^20 Oct 2026/);
    });

    it('should return the text as it came when it is not a calendar day', () => {
      expect(formatDateKey('2026-10')).toBe('2026-10');
      expect(formatDateKey('1992', 'long', 'ru')).toBe('1992');
    });

    it('should spell the month out in the long style', () => {
      expect(formatDateKey('1978-07-21', 'long')).toMatch(/21 июля 1978/);
      expect(formatDateKey('1992-11-02', 'long', 'en')).toBe('2 November 1992');
    });

    it('should format dd.mm.yyyy in every language when the numeric style is used', () => {
      expect(formatDateKey('2026-10-16', 'numeric')).toBe('16.10.2026');
      expect(formatDateKey('2026-10-16', 'numeric', 'en')).toBe('16.10.2026');
    });
  });

  describe('formatDayHeading', () => {
    it('should print weekday, day and month in Russian when the locale is ru', () => {
      expect(formatDayHeading('2026-10-19', 'ru')).toBe('понедельник, 19 октября');
    });

    it('should print the heading in English when the locale is en', () => {
      expect(formatDayHeading('2026-10-19', 'en')).toContain('19 October');
    });

    it('should name the short weekday with the numeric date when the compact style is used', () => {
      expect(formatDayHeading('2026-10-20', 'ru', 'compact')).toMatch(/^вт.*20\.10\.2026$/);
      expect(formatDayHeading('2026-10-20', 'en', 'compact')).toMatch(/^Tue.*20\.10\.2026$/);
    });
  });

  describe('formatDayShort', () => {
    it('should print day and abbreviated month when a day is formatted for the period label', () => {
      expect(formatDayShort('2026-10-19', 'ru')).toBe('19 окт.');
    });
  });

  describe('localizeInstants', () => {
    it('should replace an embedded UTC instant with the clinic time when the sentence carries one', () => {
      const text = localizeInstants('Вы записаны на приём. Начало: 2026-10-19T11:40:00.000Z', 'ru');

      expect(text).toMatch(/^Вы записаны на приём\. Начало: .*14:40$/);
      expect(text).not.toContain('T11:40');
    });

    it('should replace every instant when the sentence has several', () => {
      const text = localizeInstants('С 2026-10-19T07:00:00Z до 2026-10-19T08:00:00+00:00', 'en');

      expect(text).toMatch(/^С 19 Oct 2026, 10:00 до 19 Oct 2026, 11:00$/);
    });

    it('should leave a sentence without instants untouched', () => {
      expect(localizeInstants('Запись отменена. Причина: болею', 'ru')).toBe('Запись отменена. Причина: болею');
    });
  });
});

describe('groupSlotsByDay', () => {
  it('should group by clinic day and sort days and slots ascending when slots come in any order', () => {
    const days = groupSlotsByDay([
      slot('c', '2026-10-20T07:00:00.000Z'),
      slot('b', '2026-10-19T12:00:00.000Z'),
      slot('a', '2026-10-19T11:00:00.000Z'),
    ]);

    expect(days.map((day) => day.day)).toEqual(['2026-10-19', '2026-10-20']);
    expect(days[0]?.slots.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('should put a slot on the next Minsk day when it starts late in the evening UTC', () => {
    expect(groupSlotsByDay([slot('late', '2026-10-19T21:30:00.000Z')]).map((day) => day.day)).toEqual(['2026-10-20']);
    expect(groupSlotsByDay([slot('late', '2026-10-17T22:30:00Z')])[0]?.day).toBe('2026-10-18');
  });

  it('should return no groups when there are no slots', () => {
    expect(groupSlotsByDay([])).toEqual([]);
  });

  it('should not throw when a slot has no readable start', () => {
    expect(() => groupSlotsByDay([slot('broken', 'nope')])).not.toThrow();
  });
});

describe('Intl formatters', () => {
  const SLOT_COUNT = 300;
  /** 14 days of 16 half-hour slots from 08:00 Minsk time: the load of a doctor page. */
  const slots = Array.from({ length: SLOT_COUNT }, (_, index) => {
    const dayStart: number = Date.parse(`${shiftDateKey('2026-10-19', Math.floor(index / 16))}T05:00:00.000Z`);
    return slot(`s-${index}`, new Date(dayStart + (index % 16) * 30 * 60_000).toISOString());
  });

  function warmUp(): void {
    formatClinicTime('2026-10-19T11:00:00.000Z', 'ru');
    formatClinicTime('2026-10-19T11:00:00.000Z', 'en');
    formatDayHeading('2026-10-19', 'ru');
    formatDayShort('2026-10-19', 'ru');
    formatClinicDateTime('2026-10-19T11:00:00.000Z', 'ru');
    formatClinicDate('2026-10-19T11:00:00.000Z', 'ru');
    formatDateKey('2026-10-19', 'medium', 'ru');
    groupSlotsByDay(slots.slice(0, 2));
  }

  it('should construct no Intl.DateTimeFormat when 300 slots are grouped and formatted after the first use', () => {
    warmUp();
    const construct = jest.spyOn(Intl, 'DateTimeFormat');

    groupSlotsByDay(slots);
    slots.forEach((item) => formatClinicTime(item.start, 'ru'));
    ['2026-10-19', '2026-10-20', '2026-10-21'].forEach((day) => formatDayHeading(day, 'ru'));
    formatDayShort('2026-10-19', 'ru');
    formatClinicDateTime(slots[0]?.start ?? '', 'ru');
    formatClinicDate('2026-10-19T11:00:00.000Z', 'ru');
    formatDateKey('2026-10-19', 'medium', 'ru');

    expect(construct).not.toHaveBeenCalled();
    construct.mockRestore();
  });

  it('should keep a formatter per locale when both locales are used', () => {
    expect(formatClinicTime('2026-10-19T11:00:00.000Z', 'ru')).toBe('14:00');
    expect(formatClinicTime('2026-10-19T11:00:00.000Z', 'en')).toBe('14:00');
    expect(formatDayHeading('2026-10-19', 'ru')).toBe('понедельник, 19 октября');
    expect(formatDayHeading('2026-10-19', 'en')).toContain('19 October');
  });

  it('should return the same grouping when the list is grouped twice', () => {
    expect(groupSlotsByDay(slots)).toEqual(groupSlotsByDay(slots));
  });
});
