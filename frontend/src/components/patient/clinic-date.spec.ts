import { formatClinicDate, formatClinicDateTime, formatClinicTime, formatDateOnly, localizeInstants } from './clinic-date';

describe('formatClinicDateTime', () => {
  it('should show an instant in the Minsk zone (UTC+3) when the locale is ru', () => {
    expect(formatClinicDateTime('2026-10-19T07:00:00.000Z', 'ru')).toMatch(/10:00/);
  });

  it('should roll the date over when the Minsk day is later than the UTC day', () => {
    expect(formatClinicDateTime('2026-10-19T22:30:00.000Z', 'en')).toMatch(/20 Oct 2026.*01:30/);
  });

  it('should return the raw text when the value is not a date', () => {
    expect(formatClinicDateTime('soon', 'ru')).toBe('soon');
  });
});

describe('formatClinicTime', () => {
  it('should show only the clock time of an instant in the Minsk zone', () => {
    expect(formatClinicTime('2026-10-19T07:30:00.000Z', 'ru')).toBe('10:30');
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

describe('formatDateOnly', () => {
  it('should not shift a birth date through any time zone', () => {
    expect(formatDateOnly('1992-11-02', 'en')).toBe('2 November 1992');
  });

  it('should return a partial FHIR date as it is when the day is missing', () => {
    expect(formatDateOnly('1992', 'ru')).toBe('1992');
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
