import {
  addClinicDays,
  CLINIC_TIME_ZONE,
  clinicDateOf,
  clinicDayCode,
  clinicDayEndMs,
  clinicDaysBetween,
  clinicDayStartMs,
  clinicInstantMs,
} from './clinic-calendar';

describe('clinic calendar', () => {
  describe('clinicDateOf', () => {
    it('should return the next calendar day when the instant is after 21:00 UTC', () => {
      // Act
      const date = clinicDateOf(Date.parse('2026-11-01T21:00:00.000Z'));

      // Assert
      expect(date).toBe('2026-11-02');
    });

    it('should keep the calendar day when the instant is before 21:00 UTC', () => {
      // Act
      const date = clinicDateOf(Date.parse('2026-11-01T20:59:59.999Z'));

      // Assert
      expect(date).toBe('2026-11-01');
    });
  });

  describe('clinic day boundaries', () => {
    it('should start a clinic day at 21:00 UTC of the previous day when the date is given', () => {
      // Act
      const start = new Date(clinicDayStartMs('2026-11-02')).toISOString();

      // Assert
      expect(start).toBe('2026-11-01T21:00:00.000Z');
    });

    it('should end a clinic day one millisecond before the next one starts when the date is given', () => {
      // Act
      const end = new Date(clinicDayEndMs('2026-11-02')).toISOString();

      // Assert
      expect(end).toBe('2026-11-02T20:59:59.999Z');
      expect(clinicDayEndMs('2026-11-02') + 1).toBe(clinicDayStartMs('2026-11-03'));
    });

    it('should place a window time on the clinic day when the minute of day is given', () => {
      // Act
      const instant = new Date(clinicInstantMs('2026-11-02', 9 * 60)).toISOString();

      // Assert — 09:00 in Minsk is 06:00Z.
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
      // Act
      const days = clinicDaysBetween(Date.parse('2026-11-01T21:30:00.000Z'), Date.parse('2026-11-03T10:00:00.000Z'));

      // Assert
      expect(days).toEqual(['2026-11-02', '2026-11-03']);
    });

    it('should return no days when the end falls on an earlier clinic day', () => {
      // Act
      const days = clinicDaysBetween(Date.parse('2026-11-03T10:00:00.000Z'), Date.parse('2026-11-02T10:00:00.000Z'));

      // Assert
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
        // Act
        const rendered = minskHour.format(new Date(clinicInstantMs(date, 9 * 60)));

        // Assert — a DST rule (Minsk has none) would shift summer or the clock-change days.
        expect(rendered).toBe('09:00');
      },
    );
  });
});
