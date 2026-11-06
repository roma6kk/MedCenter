import {
  addClinicDays,
  CLINIC_TIME_ZONE,
  clinicDateOf,
  clinicDayCode,
  clinicDayEndMs,
  clinicDaysBetween,
  clinicDayStartMs,
  clinicInstantMs,
  formatClinicDateTime,
  formatSlotPeriod,
} from './clinic-calendar';

describe('clinic calendar', () => {
  describe('clinicDateOf', () => {
    it('should return the next calendar day when the instant is after 21:00 UTC', () => {
      const date = clinicDateOf(Date.parse('2026-11-01T21:00:00.000Z'));

      expect(date).toBe('2026-11-02');
    });

    it('should keep the calendar day when the instant is before 21:00 UTC', () => {
      const date = clinicDateOf(Date.parse('2026-11-01T20:59:59.999Z'));

      expect(date).toBe('2026-11-01');
    });
  });

  describe('clinic day boundaries', () => {
    it('should start a clinic day at 21:00 UTC of the previous day when the date is given', () => {
      const start = new Date(clinicDayStartMs('2026-11-02')).toISOString();

      expect(start).toBe('2026-11-01T21:00:00.000Z');
    });

    it('should end a clinic day one millisecond before the next one starts when the date is given', () => {
      const end = new Date(clinicDayEndMs('2026-11-02')).toISOString();

      expect(end).toBe('2026-11-02T20:59:59.999Z');
      expect(clinicDayEndMs('2026-11-02') + 1).toBe(clinicDayStartMs('2026-11-03'));
    });

    it('should place a window time on the clinic day when the minute of day is given', () => {
      const instant = new Date(clinicInstantMs('2026-11-02', 9 * 60)).toISOString();

      expect(instant).toBe('2026-11-02T06:00:00.000Z');
    });
  });

  describe('clinicDayCode', () => {
    it.each([
      ['2026-11-02', 'MO'],
      ['2026-11-03', 'TU'],
      ['2026-11-08', 'SU'],
    ])('should map %s to %s when the weekday is read from the calendar date', (date, code) => {
      expect(clinicDayCode(date)).toBe(code);
    });
  });

  describe('clinicDaysBetween', () => {
    it('should list every clinic day of the span when both ends are instants', () => {
      const days = clinicDaysBetween(Date.parse('2026-11-01T21:30:00.000Z'), Date.parse('2026-11-03T10:00:00.000Z'));

      expect(days).toEqual(['2026-11-02', '2026-11-03']);
    });

    it('should return no days when the end falls on an earlier clinic day', () => {
      const days = clinicDaysBetween(Date.parse('2026-11-03T10:00:00.000Z'), Date.parse('2026-11-02T10:00:00.000Z'));

      expect(days).toEqual([]);
    });
  });

  describe('addClinicDays', () => {
    it('should cross a month boundary when days are added to a date', () => {
      expect(addClinicDays('2026-11-28', 5)).toBe('2026-12-03');
    });
  });

  describe('agreement with Intl Europe/Minsk', () => {
    const minskHour = new Intl.DateTimeFormat('en-GB', {
      timeZone: CLINIC_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });

    it.each(['2026-01-15', '2026-07-15', '2026-03-29', '2026-10-25'])(
      'should render the 09:00 instant of %s as 09:00 in Europe/Minsk when the fixed offset is used',
      (date) => {
        const rendered = minskHour.format(new Date(clinicInstantMs(date, 9 * 60)));

        expect(rendered).toBe('09:00');
      },
    );
  });
});

describe('formatSlotPeriod', () => {
  it('should render a same-day period in clinic time (Europe/Minsk, UTC+3) when both bounds share a day', () => {
    expect(formatSlotPeriod('2026-11-02T09:00:00.000Z', '2026-11-02T09:30:00.000Z')).toBe('02.11.2026 12:00–12:30');
  });

  it('should repeat the date on the end bound when the period crosses midnight in clinic time', () => {
    expect(formatSlotPeriod('2026-11-02T20:30:00.000Z', '2026-11-02T21:30:00.000Z')).toBe('02.11.2026 23:30–03.11.2026 00:30');
  });

  it('should honour an explicit offset on the stored instant when the slot was written with one', () => {
    expect(formatSlotPeriod('2026-11-02T12:00:00+03:00', '2026-11-02T12:30:00+03:00')).toBe('02.11.2026 12:00–12:30');
  });

  it('should fall back to the raw values when a bound is not a parsable instant', () => {
    expect(formatSlotPeriod('', 'not-a-date')).toBe('–not-a-date');
  });
});

describe('formatClinicDateTime', () => {
  it('should render the instant as DD.MM.YYYY HH:mm in clinic time when the value is an instant', () => {
    expect(formatClinicDateTime('2026-10-22T09:30:00Z')).toBe('22.10.2026 12:30');
  });

  it('should return undefined when the value is no instant', () => {
    expect(formatClinicDateTime('not-a-date')).toBeUndefined();
  });
});
